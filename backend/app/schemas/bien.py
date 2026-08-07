"""Esquemas de entrada/salida de la API.

Se mantienen separados de los modelos de tabla a propósito: el cliente nunca
debe poder escribir `id`, `creado_en` ni `fecha_ultima_lectura` directamente.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import CategoriaBien, EstadoBien, TipoEvento
from app.services.ncf import NCFInvalidoError, validar_ncf


class _CoordenadasMixin(BaseModel):
    """Par lat/lon opcional, validado en rango WGS84."""

    latitud: float | None = Field(default=None, ge=-90, le=90)
    longitud: float | None = Field(default=None, ge=-180, le=180)
    precision_gps_m: float | None = Field(default=None, ge=0)


# --------------------------------------------------------------------------- #
# Bienes muebles                                                              #
# --------------------------------------------------------------------------- #
class BienCrear(_CoordenadasMixin):
    """Alta de un bien. El NCF lo genera el servidor salvo que se envíe uno."""

    nombre: str = Field(min_length=2, max_length=160)
    descripcion: str | None = Field(default=None, max_length=1000)
    categoria: CategoriaBien = CategoriaBien.OTRO
    estado: EstadoBien = EstadoBien.BUENO
    usuario_asignado: str | None = Field(default=None, max_length=120)
    ubicacion_descriptiva: str | None = Field(default=None, max_length=200)
    foto_url: str | None = Field(default=None, max_length=500)

    # Solo para migrar inventarios que ya traen su propia numeración.
    ncf: str | None = Field(
        default=None,
        description="Opcional. Si se omite, el servidor genera el siguiente NCF de la categoría.",
    )

    @field_validator("ncf")
    @classmethod
    def _validar_ncf(cls, v: str | None) -> str | None:
        if v is None:
            return None
        try:
            return validar_ncf(v)
        except NCFInvalidoError as exc:
            raise ValueError(str(exc)) from exc


class BienActualizar(_CoordenadasMixin):
    """Edición parcial (PATCH). Todo opcional; el NCF es inmutable por diseño."""

    nombre: str | None = Field(default=None, min_length=2, max_length=160)
    descripcion: str | None = Field(default=None, max_length=1000)
    categoria: CategoriaBien | None = None
    estado: EstadoBien | None = None
    usuario_asignado: str | None = Field(default=None, max_length=120)
    ubicacion_descriptiva: str | None = Field(default=None, max_length=200)
    foto_url: str | None = Field(default=None, max_length=500)


class BienLeer(BaseModel):
    """Representación pública de un bien."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    ncf: str
    nombre: str
    descripcion: str | None
    categoria: CategoriaBien
    estado: EstadoBien
    latitud: float | None
    longitud: float | None
    precision_gps_m: float | None
    usuario_asignado: str | None
    ubicacion_descriptiva: str | None
    foto_url: str | None
    fecha_ultima_lectura: datetime | None
    creado_en: datetime
    actualizado_en: datetime

    # Campo derivado: se calcula al serializar, no se persiste.
    url_etiqueta: str | None = Field(
        default=None, description="URL que debe grabarse en la etiqueta NFC de este bien"
    )


# --------------------------------------------------------------------------- #
# Auditoría                                                                   #
# --------------------------------------------------------------------------- #
class AuditoriaCrear(_CoordenadasMixin):
    """Registro de una auditoría de presencia hecha desde el teléfono."""

    tipo: TipoEvento = TipoEvento.AUDITORIA_PRESENCIA
    usuario: str | None = Field(default=None, max_length=120)
    nota: str | None = Field(default=None, max_length=500)

    sincronizar_ubicacion: bool = Field(
        default=False,
        description=(
            "Si es true y vienen coordenadas, además de registrar el evento se "
            "sobrescribe la ubicación guardada del bien con la del teléfono."
        ),
    )


class AuditoriaLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bien_id: int
    ncf: str
    tipo: TipoEvento
    latitud: float | None
    longitud: float | None
    precision_gps_m: float | None
    usuario: str | None
    nota: str | None
    registrado_en: datetime


class RespuestaAuditoria(BaseModel):
    """Lo que devuelve el endpoint de auditoría: el evento y el bien ya actualizado."""

    evento: AuditoriaLeer
    bien: BienLeer


# --------------------------------------------------------------------------- #
# Utilidades                                                                  #
# --------------------------------------------------------------------------- #
class UbicacionActualizar(BaseModel):
    """Cuerpo de `PUT /bienes/{ncf}/ubicacion` — el botón del mapa."""

    latitud: float = Field(ge=-90, le=90)
    longitud: float = Field(ge=-180, le=180)
    precision_gps_m: float | None = Field(default=None, ge=0)
    usuario: str | None = Field(default=None, max_length=120)


class PreviewNCF(BaseModel):
    """Respuesta de `GET /ncf/preview` — para mostrar el código antes de dar de alta."""

    ncf: str
    url_etiqueta: str
    categoria: CategoriaBien
