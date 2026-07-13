from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.db import get_db
from app.models.truck import Compartment, Truck
from app.schemas.truck import TruckCreate, TruckRead

router = APIRouter(prefix="/trucks", tags=["trucks"])


@router.get("", response_model=list[TruckRead])
def list_trucks(db: Session = Depends(get_db)):
    return db.scalars(select(Truck).options(selectinload(Truck.compartments))).all()


@router.post("", response_model=TruckRead, status_code=201)
def create_truck(payload: TruckCreate, db: Session = Depends(get_db)):
    if db.scalar(select(Truck).where(Truck.code == payload.code)):
        raise HTTPException(409, f"ya existe un camion con ficha {payload.code}")

    data = payload.model_dump()
    compartments_data = data.pop("compartments")
    truck = Truck(**data)
    truck.compartments = [Compartment(**c) for c in compartments_data]
    db.add(truck)
    db.commit()
    db.refresh(truck)
    return truck
