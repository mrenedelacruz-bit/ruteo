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
  producto + cantidad. Tiene dos fechas: `created_at` (fecha/hora de
  colocación, en UTC — **inmutable**, nunca se modifica después de crear
  el pedido) y `promised_date` (fecha objetivo de entrega — sí editable,
  ver más abajo).
- **Trip / TripStop / CompartmentAllocation**: el resultado de un despacho —
  qué camión, qué compartimientos, en qué orden visita a los clientes.

### Motor de asignación de flota (`app/services/assignment.py`)

Bin-packing con **llenado exacto**, reflejando cómo opera la empresa:

- **Un camión solo sale completo**: todos sus compartimientos deben quedar
  llenos exactamente a su capacidad, o el camión no se despacha en esa
  corrida — sus pedidos quedan `pending` para la próxima corrida, cuando
  haya más demanda acumulada. No se envían camiones a medio cargar.
- Un compartimiento con producto dedicado sólo acepta ese producto. Uno
  **flexible** (p. ej. los del camión "WOP") admite cualquiera de varios
  productos, pero nunca mezcla dos productos distintos en el mismo
  compartimiento — la elección de qué producto lleva puede variar de un
  viaje a otro.
- Una línea de pedido es divisible: su cantidad puede repartirse entre
  varios compartimientos o camiones, y un compartimiento puede llenarse
  combinando varias líneas del mismo producto (incluso de pedidos o
  clientes distintos) hasta completar exactamente su capacidad.
- El pedido de un cliente con varios combustibles se intenta consolidar
  en un solo camión (una línea por compartimiento); si no cabe completo,
  se reparte entre varios camiones.
- Heurística: los camiones se procesan de menor a mayor capacidad total
  (los más chicos necesitan menos demanda acumulada para completarse).
  Encontrar el máximo global de camiones despachables en una corrida es
  NP-difícil en general; esto es determinista y razonable para los
  volúmenes típicos de la operación, pero no garantiza el óptimo.
- *Shortfall* ya no significa "falta de capacidad temporal" (eso es
  simplemente un pedido pendiente, visible en `unassigned_order_ids`):
  ahora significa que ningún camión activo de la flota — ni dedicado ni
  flexible — podría transportar ese producto nunca, sin importar cuánta
  demanda se acumule.

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

### Fecha de promesa (`app/services/promise_date.py`)

Al crear un pedido se calcula automáticamente una fecha objetivo de
entrega, según la hora de colocación en horario de República Dominicana:

- Antes de las 4:00pm → promete el día siguiente.
- A las 4:00pm o después → promete dos días después.

Es una fecha objetivo, sujeta a que se complete la carga de un camión (ver
más arriba) — no una garantía. A diferencia de `created_at` (inmutable),
`promised_date` sí se puede editar vía `PATCH /orders/{id}/promised-date`,
pero solo hacia el mismo día del pedido o uno posterior (nunca antes de la
fecha en que se colocó).

### Vistas de seguimiento (pestañas del frontend)

- **Pedidos pendientes** (todos los roles): fecha/hora de colocación,
  fecha de promesa (editable), y qué se pidió — de un vistazo, incluyendo
  un aviso si un pedido ya pasó su fecha de promesa sin despacharse.
- **Carga de flota** (`GET /dispatch/loading-status`, solo despachadores):
  para cada camión activo, el estado de cada compartimiento con la
  demanda pendiente actual — lleno, o cuánto y qué producto le falta para
  completarse. Es una vista de solo lectura (no genera ningún despacho)
  que usa la misma lógica y el mismo orden que un despacho real, así que
  un camión que aparece "Listo para despachar" aquí es exactamente el que
  saldría en el próximo `POST /dispatch/generate`.

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

Seis vistas (las últimas cuatro solo visibles para el rol despachador):

- **Tomar pedido**: alta de clientes nuevos (con búsqueda de dirección) y
  creación de pedidos (producto + cantidad, múltiples líneas por pedido).
- **Pedidos pendientes**: fecha/hora de colocación, fecha de promesa
  (editable) y productos de cada pedido pendiente.
- **Despacho**: botón para generar el despacho (asignación de flota +
  ruteo), y visualización en mapa (Leaflet/OpenStreetMap) de las rutas
  resultantes por camión.
- **Viajes**: iniciar un viaje, confirmar la entrega de cada parada,
  cancelar, con filtro por estado.
- **Carga de flota**: cómo se va llenando cada camión activo con los
  pedidos pendientes, y qué le falta al que no está listo.
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
