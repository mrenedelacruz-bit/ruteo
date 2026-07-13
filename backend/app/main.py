from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.deps import get_current_user, require_dispatcher
from app.api.routes import (
    auth,
    customers,
    depots,
    dispatch,
    geocode,
    orders,
    products,
    trips,
    trucks,
    users,
)

app = FastAPI(title="Ruteo — Pedidos y despacho de combustible")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)

# Cualquier usuario autenticado (vendedor o despachador)
_authenticated = [Depends(get_current_user)]
app.include_router(products.router, dependencies=_authenticated)
app.include_router(customers.router, dependencies=_authenticated)
app.include_router(depots.router, dependencies=_authenticated)
app.include_router(orders.router, dependencies=_authenticated)
app.include_router(geocode.router, dependencies=_authenticated)

# Solo despachadores: flota, despachos, viajes y usuarios
_dispatcher_only = [Depends(require_dispatcher)]
app.include_router(trucks.router, dependencies=_dispatcher_only)
app.include_router(dispatch.router, dependencies=_dispatcher_only)
app.include_router(trips.router, dependencies=_dispatcher_only)
app.include_router(users.router, dependencies=_dispatcher_only)


@app.get("/health")
def health():
    return {"status": "ok"}


# Sirve el frontend compilado (frontend/dist, copiado a ./static en la
# imagen Docker) en el mismo origen que la API. Se monta al final para que
# las rutas de la API de arriba tengan prioridad. La app no usa rutas del
# navegador (las pestañas son estado en memoria), asi que basta con servir
# "/" e index.html; no hace falta un fallback SPA para sub-rutas.
_static_dir = Path(__file__).resolve().parent.parent / "static"
if _static_dir.is_dir():
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="frontend")
