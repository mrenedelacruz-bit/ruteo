"""Endpoints REST del inventario de bienes muebles."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import BienDep, NCFDep, SessionDep
from app.core.config import settings
from app.models.enums import CategoriaBien, EstadoBien
from app.schemas.bien import (
    AuditoriaCrear,
    AuditoriaLeer,
    BienActualizar,
    BienCrear,
    BienLeer,
    PreviewNCF,
    RespuestaAuditoria,
    UbicacionActualizar,
)
from app.services import inventario
from app.services.ncf import url_etiqueta

router = APIRouter(prefix="/bienes", tags=["Bienes muebles"])


# --------------------------------------------------------------------------- #
# Listado y alta                                                              #
# --------------------------------------------------------------------------- #
@router.get("", response_model=list[BienLeer], summary="Listar bienes muebles")
def listar_bienes(
    session: SessionDep,
    estado: EstadoBien | None = Query(default=None),
    categoria: CategoriaBien | None = Query(default=None),
    usuario: str | None = Query(default=None, description="Filtra por usuario asignado"),
    solo_geolocalizados: bool = Query(
        default=False, description="Solo los que tienen coordenadas — usado por el mapa"
    ),
    limite: int = Query(default=500, ge=1, le=2000),
    desplazamiento: int = Query(default=0, ge=0),
) -> list[BienLeer]:
    bienes = inventario.listar(
        session,
        estado=estado.value if estado else None,
        categoria=categoria.value if categoria else None,
        usuario=usuario,
        solo_geolocalizados=solo_geolocalizados,
        limite=limite,
        desplazamiento=desplazamiento,
    )
    return [inventario.a_esquema(b) for b in bienes]


@router.post(
    "",
    response_model=BienLeer,
    status_code=status.HTTP_201_CREATED,
    summary="Dar de alta un bien y generar su NCF",
)
def crear_bien(datos: BienCrear, session: SessionDep) -> BienLeer:
    try:
        bien = inventario.crear(session, datos)
    except inventario.NCFDuplicadoError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return inventario.a_esquema(bien)


# --------------------------------------------------------------------------- #
# Ficha individual — la ruta que abre el iPhone al leer la etiqueta            #
# --------------------------------------------------------------------------- #
@router.get("/{ncf}", response_model=BienLeer, summary="Ficha técnica por NCF")
def obtener_bien(bien: BienDep) -> BienLeer:
    """Lo que consume la vista `/activo/{ncf}` de la PWA tras el escaneo NFC."""
    return inventario.a_esquema(bien)


@router.patch("/{ncf}", response_model=BienLeer, summary="Editar un bien (parcial)")
def actualizar_bien(bien: BienDep, cambios: BienActualizar, session: SessionDep) -> BienLeer:
    return inventario.a_esquema(inventario.actualizar(session, bien, cambios))


@router.delete(
    "/{ncf}", status_code=status.HTTP_204_NO_CONTENT, summary="Eliminar un bien del inventario"
)
def eliminar_bien(bien: BienDep, session: SessionDep) -> None:
    """Baja definitiva del registro.

    Para dar de baja *el activo* conservando su historial, use
    `PATCH /bienes/{ncf}` con `estado="Baja"`. Este endpoint borra la fila.
    """
    session.delete(bien)
    session.commit()


# --------------------------------------------------------------------------- #
# Geolocalización                                                             #
# --------------------------------------------------------------------------- #
@router.put(
    "/{ncf}/ubicacion",
    response_model=BienLeer,
    summary="Actualizar ubicación con la posición GPS del dispositivo",
)
def actualizar_ubicacion(
    bien: BienDep, datos: UbicacionActualizar, session: SessionDep
) -> BienLeer:
    actualizado = inventario.actualizar_ubicacion(
        session,
        bien,
        latitud=datos.latitud,
        longitud=datos.longitud,
        precision_gps_m=datos.precision_gps_m,
        usuario=datos.usuario,
    )
    return inventario.a_esquema(actualizado)


# --------------------------------------------------------------------------- #
# Auditoría de presencia                                                      #
# --------------------------------------------------------------------------- #
@router.post(
    "/{ncf}/auditorias",
    response_model=RespuestaAuditoria,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar auditoría de presencia (escaneo NFC en campo)",
)
def registrar_auditoria(
    bien: BienDep, datos: AuditoriaCrear, session: SessionDep
) -> RespuestaAuditoria:
    evento, actualizado = inventario.registrar_auditoria(session, bien, datos)
    return RespuestaAuditoria(
        evento=AuditoriaLeer.model_validate(evento),
        bien=inventario.a_esquema(actualizado),
    )


@router.get(
    "/{ncf}/auditorias",
    response_model=list[AuditoriaLeer],
    summary="Historial de lecturas y cambios de un bien",
)
def listar_auditorias(
    ncf: NCFDep, session: SessionDep, limite: int = Query(default=50, ge=1, le=500)
) -> list[AuditoriaLeer]:
    return [AuditoriaLeer.model_validate(e) for e in inventario.historial(session, ncf, limite)]


# --------------------------------------------------------------------------- #
# Utilidades para el panel de administración                                  #
# --------------------------------------------------------------------------- #
utilidades = APIRouter(tags=["Utilidades"])


@utilidades.get(
    "/ncf/preview",
    response_model=PreviewNCF,
    summary="Ver el próximo NCF de una categoría sin dar de alta nada",
)
def preview_ncf(categoria: CategoriaBien, session: SessionDep) -> PreviewNCF:
    """Permite imprimir y grabar la etiqueta antes de crear el registro."""
    ncf = inventario.siguiente_ncf(session, categoria)
    return PreviewNCF(
        ncf=ncf,
        url_etiqueta=url_etiqueta(ncf, settings.PUBLIC_BASE_URL),
        categoria=categoria,
    )


@utilidades.get("/catalogos", summary="Catálogos de estados y categorías")
def catalogos() -> dict[str, list[dict[str, str]]]:
    """El frontend arma sus selectores desde aquí, sin duplicar constantes."""
    return {
        "estados": [{"valor": e.value, "nombre": e.value} for e in EstadoBien],
        "categorias": [
            {"valor": c.value, "nombre": c.value, "codigo": c.codigo} for c in CategoriaBien
        ],
    }
