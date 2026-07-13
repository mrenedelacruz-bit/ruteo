# ruteo

Sistema de toma de pedidos, asignación de flota y ruteo de entregas para una
empresa distribuidora de combustible: pedidos de clientes (producto +
cantidad) se asignan automáticamente a camiones cisterna (divididos en
compartimientos por producto) y se genera la ruta de entrega óptima desde la
Refinería Dominicana de Petróleos (REFIDOMSA) hasta cada cliente.

## Arquitectura

```
backend/   API en FastAPI + PostgreSQL/PostGIS (Python)
frontend/  App en React + TypeScript + Vite (toma de pedidos y panel de despacho)
```

### Modelo de datos

- **Product**: tipo de producto (Fuel Oil, Diesel Regular, Diesel Premium,
  Gasolina Regular, Gasolina Premium, ...).
- **Truck / Compartment**: cada camión tiene N compartimientos, cada uno con
  su propia capacidad y (opcionalmente) un **producto dedicado** — evita
  mezclar productos distintos en el mismo tanque. Un compartimiento sin
  producto asignado es flexible y admite cualquier producto.
- **Customer**: cliente con dirección y coordenadas (lat/lng).
- **Depot**: punto de origen de despacho (p. ej. REFIDOMSA, Haina).
- **Order / OrderLine**: pedido de un cliente con una o más líneas de
  producto + cantidad.
- **Trip / TripStop / CompartmentAllocation**: el resultado de un despacho —
  qué camión, qué compartimientos, en qué orden visita a los clientes.

### Motor de asignación de flota (`app/services/assignment.py`)

Bin-packing *first-fit-decreasing* con las siguientes reglas de negocio:

- Un compartimiento con producto dedicado sólo acepta ese producto.
- Una vez que un compartimiento recibe carga en un viaje, no se reutiliza
  para otro pedido en el mismo viaje (se asume descarga total en la parada
  del cliente — evita mezclar combustible de dos clientes en el mismo
  tanque).
- Si una línea de pedido excede la capacidad de cualquier compartimiento
  disponible, se divide entre varios compartimientos (incluso de distintos
  camiones).
- Se prefiere consolidar pedidos en camiones ya usados en la misma corrida
  de despacho, para minimizar la cantidad de camiones necesarios.
- Si la flota activa no tiene capacidad suficiente, el pedido (o el
  remanente) se reporta como *shortfall* en vez de fallar silenciosamente.

### Motor de ruteo (`app/services/routing.py`)

Heurística clásica de TSP (vecino más cercano + mejora 2-opt). La función de
distancia es inyectable:

- **Distancias viales reales** vía OSRM (`app/services/road_distance.py`):
  una sola llamada al servicio `/table` por viaje obtiene la matriz de
  distancias por carretera entre el depósito y todas las paradas. Se
  configura con `OSRM_BASE_URL` (por defecto el servidor público de demo;
  para producción montar una instancia propia con mapas de RD).
- **Fallback automático a haversine** (línea recta): si OSRM no está
  configurado, no responde, o no encuentra ruta entre dos puntos, el
  despacho se genera igual con distancias geodésicas y queda un aviso en el
  log — nunca falla por culpa del servicio externo.

### Geocodificación de direcciones (`app/services/geocoding.py`)

`GET /geocode?q=<dirección>` busca direcciones vía Nominatim
(OpenStreetMap), limitado a República Dominicana (`GEOCODE_COUNTRY_CODES`).
En el formulario de alta de cliente, el botón **"Buscar en mapa"** consulta
este endpoint y llena lat/lng automáticamente al elegir un resultado; si el
servicio no está disponible se pueden seguir ingresando las coordenadas a
mano. Configurar un `GEOCODE_USER_AGENT` propio según la política de uso de
Nominatim.

### Flujo de despacho (`POST /dispatch/generate`)

1. Toma los pedidos pendientes (o una lista específica de `order_ids`).
2. Asigna cada línea de pedido a compartimientos de camiones activos.
3. Agrupa las asignaciones por camión y calcula la ruta óptima de ese
   camión entre el depósito y sus paradas.
4. Persiste `Trip`, `TripStop` y `CompartmentAllocation`, marca los pedidos
   como `assigned`, y devuelve el resultado (incluyendo *shortfalls* si la
   flota no alcanzó).

### Ciclo de vida del viaje (`/trips`)

```
planned --start--> in_progress --(todas las paradas entregadas)--> completed
planned/in_progress --cancel--> cancelled
```

- `POST /trips/{id}/start`: el camión sale; los pedidos pasan a `dispatched`.
- `POST /trips/{id}/stops/{stop_id}/deliver`: confirma la entrega de una
  parada (pedido pasa a `delivered`, se registra `delivered_at`); al
  entregar la última parada el viaje se completa solo.
- `POST /trips/{id}/cancel`: los pedidos aún no entregados vuelven a
  `pending` para poder re-despacharlos; lo ya entregado no se revierte.

La pestaña **Viajes** del frontend (solo despachadores) permite operar todo
esto por pantalla, con filtro por estado.

### Gestión de usuarios (`/users`)

Solo despachadores. Alta de usuarios, cambio de rol, activar/desactivar y
reseteo de clave desde la pestaña **Usuarios**. Un despachador no puede
quitarse a sí mismo el acceso ni el rol.

## Datos de la flota

`backend/app/seed/fleet_data.py` contiene los 10 camiones cisterna de la
flota real de la empresa (marca de chasis, año, marca de tanque,
capacidad total y capacidades de cada compartimiento). **Las fichas
originales fueron reemplazadas por códigos genéricos (T-01..T-10) y se
omitieron placas y números de chasis/VIN** a pedido explícito. Ajustar o
ampliar esta lista según vaya cambiando la flota real — no es necesario
tocar el código de la aplicación, sólo estos datos (o usar el endpoint
`POST /trucks`).

El depósito REFIDOMSA está ubicado en Carretera Sánchez Km. 17.5, Zona
Industrial de Haina, San Cristóbal (18.4239, -70.0242).

## Autenticación y roles

La API usa JWT (header `Authorization: Bearer <token>`). Dos roles:

- **dispatcher** (despachador): todo — gestiona la flota y genera despachos.
- **clerk** (vendedor): toma pedidos y da de alta clientes; no ve el panel
  de despacho.

`POST /auth/login` con `{username, password}` devuelve el token;
`GET /auth/me` devuelve el usuario actual. El seed
`python -m app.seed.seed_users` crea el despachador inicial — pasar
`ADMIN_USERNAME`/`ADMIN_PASSWORD` por variables de entorno (si no, usa
`admin`/`admin123` y avisa que hay que cambiarla). En producción configurar
también `JWT_SECRET` con un secreto propio.

## Backend — desarrollo local

Requiere PostgreSQL con la extensión PostGIS.

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

cp .env.example .env   # ajustar DATABASE_URL si es necesario

# base de datos (ejemplo con un Postgres local)
createdb ruteo
psql -d ruteo -c "CREATE EXTENSION IF NOT EXISTS postgis;"

alembic upgrade head
python -m app.seed.seed_fleet   # carga productos, depósito REFIDOMSA y la flota
ADMIN_PASSWORD=<clave-segura> python -m app.seed.seed_users   # usuario despachador inicial

uvicorn app.main:app --reload --port 8000
```

Docs interactivas de la API: http://localhost:8000/docs

### Tests

```bash
cd backend && source .venv/bin/activate
python -m pytest tests/ -v
```

Los tests cubren los algoritmos de asignación y ruteo (lógica pura, sin
base de datos).

## Frontend — desarrollo local

```bash
cd frontend
npm install
echo "VITE_API_URL=http://localhost:8000" > .env.local
npm run dev
```

Cuatro vistas (las últimas tres solo visibles para el rol despachador):

- **Tomar pedido**: alta de clientes nuevos (con búsqueda de dirección) y
  creación de pedidos (producto + cantidad, múltiples líneas por pedido).
- **Despacho**: lista de pedidos pendientes, botón para generar el
  despacho (asignación de flota + ruteo), y visualización en mapa
  (Leaflet/OpenStreetMap) de las rutas resultantes por camión.
- **Viajes**: iniciar un viaje, confirmar la entrega de cada parada,
  cancelar, con filtro por estado.
- **Usuarios**: crear usuarios, cambiar rol, activar/desactivar, resetear
  clave.

## Despliegue de demo (URL pública)

El repo incluye un `Dockerfile` (compila el frontend y lo sirve desde el
mismo servicio FastAPI — un solo origen, sin configurar CORS ni URLs
cruzadas) y un `render.yaml` para desplegar en [Render](https://render.com)
con un clic, usando tu propia cuenta — no hace falta compartir ninguna
credencial:

1. Entra a este enlace (ajusta la rama si ya se fusionó a `main`):
   `https://render.com/deploy?repo=https://github.com/mrenedelacruz-bit/ruteo/tree/claude/fuel-delivery-orders-3b2b7d`
2. Render detecta `render.yaml` y muestra el plan: una base de datos
   Postgres y un servicio web, ambos en el plan gratuito.
3. Te pedirá el valor de **`ADMIN_PASSWORD`** (el único campo manual) —
   pon una clave segura, será la del usuario `admin` inicial.
4. Click en "Apply" / "Deploy Blueprint". La primera build tarda varios
   minutos (compila el frontend, instala el backend, aplica migraciones —
   incluyendo `CREATE EXTENSION postgis` automático — y carga la flota).
5. Cuando el servicio quede "Live", entra a la URL que te da Render
   (`https://ruteo-demo-XXXX.onrender.com`) e inicia sesión con
   `admin` / la clave que pusiste.

Notas del plan gratuito de Render: el servicio "duerme" tras 15 minutos
sin tráfico (la primera petición después tarda ~30-60s en responder) y la
base de datos gratuita expira a los 30 días — para una demo puntual es
suficiente; para algo permanente conviene pasar a un plan pago.

## Próximos pasos sugeridos

- Confirmación de entrega con geolocalización del camión (app móvil del
  chofer).
- Instancia propia de OSRM con mapas de República Dominicana (el servidor
  público de demo no tiene garantías de disponibilidad).
- Reportes: galones entregados por producto/cliente/período, kilómetros
  recorridos por camión.
