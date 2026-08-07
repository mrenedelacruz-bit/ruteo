"""Motor de base de datos y dependencia de sesión para FastAPI."""

from __future__ import annotations

from collections.abc import Iterator

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

# `check_same_thread=False` solo aplica a SQLite: por defecto prohíbe usar la
# conexión desde otro hilo, y Uvicorn atiende requests en un pool de hilos.
_connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(settings.DATABASE_URL, echo=False, connect_args=_connect_args)


def init_db() -> None:
    """Crea las tablas que aún no existan.

    Suficiente para el prototipo. En cuanto el esquema empiece a cambiar en
    producción, sustituir por migraciones Alembic (`alembic upgrade head`).
    """
    # El import tiene efecto de registro: puebla SQLModel.metadata.
    import app.models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    """Dependencia de FastAPI: una sesión por request, cerrada al terminar."""
    with Session(engine) as session:
        yield session
