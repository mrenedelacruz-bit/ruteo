"""Dependencias reutilizables de los routers."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Path, status
from sqlmodel import Session

from app.db.session import get_session
from app.models.bien import BienMueble
from app.services.inventario import BienNoEncontradoError, obtener_por_ncf
from app.services.ncf import NCFInvalidoError, validar_ncf

SessionDep = Annotated[Session, Depends(get_session)]


def ncf_valido(
    ncf: Annotated[str, Path(description="Número de Control Físico, ej. NCF-202608-MOB-0042K")],
) -> str:
    """Normaliza y valida el NCF de la ruta antes de tocar la base de datos.

    Distinguir 422 (código mal escrito) de 404 (código correcto, activo
    inexistente) es importante en campo: el primero se corrige tecleando de
    nuevo, el segundo significa que la etiqueta no está registrada.
    """
    try:
        return validar_ncf(ncf)
    except NCFInvalidoError as exc:
        # 422 literal: el nombre de la constante cambió entre versiones de Starlette.
        raise HTTPException(422, detail=str(exc)) from exc


def bien_actual(ncf: Annotated[str, Depends(ncf_valido)], session: SessionDep) -> BienMueble:
    """Carga el bien de la ruta o responde 404."""
    try:
        return obtener_por_ncf(session, ncf)
    except BienNoEncontradoError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


NCFDep = Annotated[str, Depends(ncf_valido)]
BienDep = Annotated[BienMueble, Depends(bien_actual)]
