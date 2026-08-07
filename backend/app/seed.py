"""Datos de ejemplo para levantar el prototipo con el mapa ya poblado.

Coordenadas reales del Distrito Nacional (Santo Domingo) para que los pines
caigan sobre calles existentes y el mapa se vea creíble en la demo.
"""

from __future__ import annotations

from sqlmodel import Session, select

from app.models.bien import BienMueble
from app.models.enums import CategoriaBien, EstadoBien
from app.schemas.bien import BienCrear
from app.services import inventario

_EJEMPLOS: list[BienCrear] = [
    BienCrear(
        nombre="Escritorio ejecutivo en L",
        descripcion="Madera de caoba, 1.80 m. Oficina de Dirección.",
        categoria=CategoriaBien.MOBILIARIO,
        estado=EstadoBien.BUENO,
        latitud=18.4721,
        longitud=-69.9312,
        usuario_asignado="Dirección General",
        ubicacion_descriptiva="Torre A — Piso 5",
    ),
    BienCrear(
        nombre="Laptop Dell Latitude 5440",
        descripcion="Serie DL5440-2291. Asignada a Contabilidad.",
        categoria=CategoriaBien.EQUIPO_COMPUTO,
        estado=EstadoBien.BUENO,
        latitud=18.4695,
        longitud=-69.9385,
        usuario_asignado="Contabilidad",
        ubicacion_descriptiva="Torre A — Piso 3",
    ),
    BienCrear(
        nombre="Aire acondicionado 24.000 BTU",
        descripcion="Compresor con ruido intermitente; reportado a mantenimiento.",
        categoria=CategoriaBien.EQUIPO_OFICINA,
        estado=EstadoBien.EN_REPARACION,
        latitud=18.4762,
        longitud=-69.9271,
        usuario_asignado="Mantenimiento",
        ubicacion_descriptiva="Almacén — Nave 2",
    ),
    BienCrear(
        nombre="Camioneta Toyota Hilux 2019",
        descripcion="Placa L-000000. Uso de supervisión de campo.",
        categoria=CategoriaBien.VEHICULO,
        estado=EstadoBien.REGULAR,
        latitud=18.4832,
        longitud=-69.9425,
        usuario_asignado="Operaciones",
        ubicacion_descriptiva="Parqueo exterior",
    ),
    BienCrear(
        nombre="Planta eléctrica 60 kVA",
        descripcion="Fuera de servicio, pendiente de desincorporación.",
        categoria=CategoriaBien.MAQUINARIA,
        estado=EstadoBien.BAJA,
        latitud=18.4658,
        longitud=-69.9498,
        usuario_asignado="Mantenimiento",
        ubicacion_descriptiva="Patio trasero",
    ),
    BienCrear(
        nombre="Archivador metálico 4 gavetas",
        descripcion="Sin novedad en la última auditoría.",
        categoria=CategoriaBien.MOBILIARIO,
        estado=EstadoBien.BUENO,
        latitud=18.4707,
        longitud=-69.9340,
        usuario_asignado="Recursos Humanos",
        ubicacion_descriptiva="Torre A — Piso 2",
    ),
]


def sembrar(session: Session) -> int:
    """Inserta los ejemplos si la tabla está vacía. Devuelve cuántos creó."""
    if session.exec(select(BienMueble).limit(1)).first() is not None:
        return 0  # Ya hay datos: no se toca nada.

    for ejemplo in _EJEMPLOS:
        inventario.crear(session, ejemplo)
    return len(_EJEMPLOS)
