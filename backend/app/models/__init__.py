"""Modelos de datos (SQLModel). El import agregado garantiza que SQLModel.metadata
conozca todas las tablas antes de `create_all()`."""

from app.models.auditoria import Auditoria
from app.models.bien import BienMueble
from app.models.enums import CategoriaBien, EstadoBien, TipoEvento

__all__ = ["Auditoria", "BienMueble", "CategoriaBien", "EstadoBien", "TipoEvento"]
