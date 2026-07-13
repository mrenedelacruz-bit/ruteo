from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import customers, depots, dispatch, orders, products, trucks

app = FastAPI(title="Ruteo — Pedidos y despacho de combustible")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(products.router)
app.include_router(trucks.router)
app.include_router(customers.router)
app.include_router(depots.router)
app.include_router(orders.router)
app.include_router(dispatch.router)


@app.get("/health")
def health():
    return {"status": "ok"}
