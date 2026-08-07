"""Punto de entrada de la API.

Levantar en desarrollo:
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

Documentación interactiva (generada por FastAPI, sin escribirla a mano):
    http://localhost:8000/docs
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from app.api.routes.bienes import router as bienes_router
from app.api.routes.bienes import utilidades as utilidades_router
from app.core.config import settings
from app.db.session import engine, init_db
from app.seed import sembrar


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Prepara el esquema y, en el prototipo, siembra datos de ejemplo."""
    init_db()
    if settings.SEED_ON_STARTUP:
        with Session(engine) as session:
            creados = sembrar(session)
            if creados:
                print(f"[seed] {creados} bienes de ejemplo insertados.")
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "API de gestión, inventario y geolocalización de bienes muebles "
        "identificados con etiquetas NFC. La llave de negocio es el **NCF** "
        "(Número de Control Físico) grabado en cada etiqueta."
    ),
    lifespan=lifespan,
)

# La PWA vive en otro origen (Vite en dev, GitHub Pages en producción).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(bienes_router, prefix=settings.API_PREFIX)
app.include_router(utilidades_router, prefix=settings.API_PREFIX)


@app.get("/salud", tags=["Infraestructura"], summary="Health check")
def salud() -> dict[str, str]:
    """Sonda para el orquestador / balanceador."""
    return {"estado": "ok", "version": settings.APP_VERSION}
