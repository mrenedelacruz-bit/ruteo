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

- **Product**: tipo de producto (FUEL_OIL, WOP, ...).
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

## Datos de la flota

`backend/app/seed/fleet_data.py` contiene los 10 camiones cisterna de la
flota real de la empresa (marca de chasis, año, marca de tanque,
capacidad total y capacidades de cada compartimiento). **Las fichas
originales fueron reemplazadas por códigos genéricos (T-01..T-10) y se
omitieron placas y números de chasis/VIN** a pedido explícito. Ajustar o
ampliar esta lista según vaya cambiando la flota real — no es necesario
tocar el código de la aplicación, sólo estos datos (o usar el endpoint
`POST /trucks`).

Las coordenadas de REFIDOMSA en `fleet_data.py` son aproximadas — deben
ajustarse con la ubicación GPS exacta de la planta.

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

Dos vistas:

- **Tomar pedido**: alta de clientes nuevos (con coordenadas) y creación de
  pedidos (producto + cantidad, múltiples líneas por pedido).
- **Despacho**: lista de pedidos pendientes, botón para generar el
  despacho (asignación de flota + ruteo), y visualización en mapa
  (Leaflet/OpenStreetMap) de las rutas resultantes por camión.

## Próximos pasos sugeridos

- Gestión de usuarios desde la UI (hoy se crean por seed o directamente en
  la base de datos).
- Estados de viaje en tiempo real (en curso, completado) y confirmación de
  entrega con geolocalización del camión.
- Instancia propia de OSRM con mapas de República Dominicana (el servidor
  público de demo no tiene garantías de disponibilidad).
