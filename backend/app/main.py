from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
