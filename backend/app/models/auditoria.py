"""Tabla `auditorias`: bitácora inmutable de cada escaneo o cambio.

Un inventario de bienes públicos vale por su trazabilidad. Esta tabla nunca se
actualiza ni se borra: solo se le agregan filas. Si alguien pregunta "¿quién
movió el escritorio y cuándo?", la respuesta sale de aquí, no de
`bienes_muebles` (que solo guarda el estado actual).
"""

from __future__ import annotations

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.bien import ahora_utc
from app.models.enums import TipoEvento


class Auditoria(SQLModel, table=True):
    """Un evento registrado sobre un bien mueble."""

    __tablename__ = "auditorias"

    id: int | None = Field(default=None, primary_key=True)

    bien_id: int = Field(foreign_key="bienes_muebles.id", index=True)
    # Se duplica el NCF a propósito: si el bien se depura de la tabla principal,
    # la bitácora sigue siendo legible sin un JOIN a una fila inexistente.
    ncf: str = Field(index=True, max_length=32)

    tipo: TipoEvento = Field(default=TipoEvento.LECTURA_NFC, index=True)

    # Posición del *teléfono* en el instante del escaneo. No es necesariamente la
    # posición guardada del bien: el usuario decide si la sincroniza o no.
    latitud: float | None = Field(default=None, ge=-90, le=90)
    longitud: float | None = Field(default=None, ge=-180, le=180)
    precision_gps_m: float | None = Field(default=None)

    usuario: str | None = Field(default=None, max_length=120)
    nota: str | None = Field(default=None, max_length=500)

    registrado_en: datetime = Field(default_factory=ahora_utc, index=True)
