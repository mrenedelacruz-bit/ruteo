"""Enumeraciones del dominio, compartidas por modelos y esquemas.

Se guardan como *string* en la base de datos (no como int) para que un dump SQL
siga siendo legible por un auditor sin consultar un diccionario de códigos.
"""

from __future__ import annotations

from enum import Enum


class EstadoBien(str, Enum):
    """Estado físico del bien mueble. Determina el color del pin en el mapa."""

    BUENO = "Bueno"
    REGULAR = "Regular"
    EN_REPARACION = "En Reparación"
    BAJA = "Baja"


class CategoriaBien(str, Enum):
    """Categoría del bien. Cada una aporta las 3 letras centrales del NCF."""

    MOBILIARIO = "Mobiliario"
    EQUIPO_COMPUTO = "Equipo de Cómputo"
    EQUIPO_OFICINA = "Equipo de Oficina"
    VEHICULO = "Vehículo"
    MAQUINARIA = "Maquinaria"
    OTRO = "Otro"

    @property
    def codigo(self) -> str:
        """Código de 3 letras que se incrusta en el NCF."""
        return _CODIGOS_CATEGORIA[self]

    @classmethod
    def desde_codigo(cls, codigo: str) -> "CategoriaBien":
        """Inversa de `codigo`: resuelve la categoría a partir de un NCF."""
        invertido = {v: k for k, v in _CODIGOS_CATEGORIA.items()}
        try:
            return invertido[codigo.strip().upper()]
        except KeyError as exc:
            raise ValueError(f"Código de categoría desconocido: {codigo!r}") from exc


_CODIGOS_CATEGORIA: dict[CategoriaBien, str] = {
    CategoriaBien.MOBILIARIO: "MOB",
    CategoriaBien.EQUIPO_COMPUTO: "EQC",
    CategoriaBien.EQUIPO_OFICINA: "EQO",
    CategoriaBien.VEHICULO: "VEH",
    CategoriaBien.MAQUINARIA: "MAQ",
    CategoriaBien.OTRO: "OTR",
}


class TipoEvento(str, Enum):
    """Qué originó una entrada en la bitácora de auditoría."""

    ALTA = "Alta"
    LECTURA_NFC = "Lectura NFC"
    AUDITORIA_PRESENCIA = "Auditoría de presencia"
    ACTUALIZACION_UBICACION = "Actualización de ubicación"
    CAMBIO_ESTADO = "Cambio de estado"
