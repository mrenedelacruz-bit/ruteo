"""Tabla `bienes_muebles`: el inventario propiamente dicho."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel

from app.models.enums import CategoriaBien, EstadoBien


def ahora_utc() -> datetime:
    """Timestamp con zona horaria explícita.

    `datetime.utcnow()` devuelve un naive datetime y termina generando
    comparaciones erróneas al mezclarse con fechas del cliente; se evita.
    """
    return datetime.now(timezone.utc)


class BienMueble(SQLModel, table=True):
    """Un activo físico etiquetado con NFC.

    La llave primaria técnica es `id` (entero autoincremental), pero la llave
    *de negocio* es `ncf`: es lo que está grabado en la etiqueta y lo que usan
    todas las rutas públicas. Por eso `ncf` es único e indexado.
    """

    __tablename__ = "bienes_muebles"

    id: int | None = Field(default=None, primary_key=True)

    # --- Identidad -----------------------------------------------------------
    ncf: str = Field(index=True, unique=True, max_length=32, description="Número de Control Físico")

    # --- Ficha técnica -------------------------------------------------------
    nombre: str = Field(max_length=160)
    descripcion: str | None = Field(default=None, max_length=1000)
    categoria: CategoriaBien = Field(default=CategoriaBien.OTRO, index=True)
    estado: EstadoBien = Field(default=EstadoBien.BUENO, index=True)

    # --- Geolocalización -----------------------------------------------------
    # Se guardan como dos floats en vez de un tipo geográfico (PostGIS) porque el
    # prototipo corre sobre SQLite y las consultas son "dame todos los pines".
    # Migrar a PostGIS más adelante solo toca el modelo y el repositorio.
    latitud: float | None = Field(default=None, ge=-90, le=90)
    longitud: float | None = Field(default=None, ge=-180, le=180)
    precision_gps_m: float | None = Field(
        default=None, description="Exactitud reportada por el GPS del teléfono, en metros"
    )

    # --- Asignación y trazabilidad ------------------------------------------
    usuario_asignado: str | None = Field(default=None, max_length=120, index=True)
    ubicacion_descriptiva: str | None = Field(
        default=None, max_length=200, description="Ej.: 'Piso 3 — Contabilidad'"
    )
    foto_url: str | None = Field(default=None, max_length=500)

    fecha_ultima_lectura: datetime | None = Field(
        default=None, description="Última vez que alguien escaneó la etiqueta NFC"
    )
    creado_en: datetime = Field(default_factory=ahora_utc)
    actualizado_en: datetime = Field(default_factory=ahora_utc)

    # --- Ayudas de dominio ---------------------------------------------------
    @property
    def tiene_ubicacion(self) -> bool:
        return self.latitud is not None and self.longitud is not None
