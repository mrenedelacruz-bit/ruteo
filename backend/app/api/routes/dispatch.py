from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.dispatch import DispatchRequest, DispatchResult
from app.services.dispatch import generate_dispatch

router = APIRouter(prefix="/dispatch", tags=["dispatch"])


@router.post("/generate", response_model=DispatchResult)
def create_dispatch(payload: DispatchRequest, db: Session = Depends(get_db)):
    try:
        return generate_dispatch(db, depot_id=payload.depot_id, order_ids=payload.order_ids)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
