from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.dispatch import DispatchRequest, DispatchResult, TruckLoadOut
from app.services.dispatch import generate_dispatch, get_fleet_loading_status

router = APIRouter(prefix="/dispatch", tags=["dispatch"])


@router.post("/generate", response_model=DispatchResult)
def create_dispatch(payload: DispatchRequest, db: Session = Depends(get_db)):
    try:
        return generate_dispatch(db, depot_id=payload.depot_id, order_ids=payload.order_ids)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.get("/loading-status", response_model=list[TruckLoadOut])
def loading_status(db: Session = Depends(get_db)):
    return get_fleet_loading_status(db)
