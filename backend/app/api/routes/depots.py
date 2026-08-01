from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.geo import point_to_latlng, point_wkt
from app.models.depot import Depot
from app.schemas.depot import DepotCreate, DepotRead

router = APIRouter(prefix="/depots", tags=["depots"])


def _to_read(d: Depot) -> DepotRead:
    lat, lng = point_to_latlng(d.location)
    return DepotRead(id=d.id, name=d.name, address=d.address, lat=lat, lng=lng)


@router.get("", response_model=list[DepotRead])
def list_depots(db: Session = Depends(get_db)):
    return [_to_read(d) for d in db.scalars(select(Depot)).all()]


@router.post("", response_model=DepotRead, status_code=201)
def create_depot(payload: DepotCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    lat, lng = data.pop("lat"), data.pop("lng")
    depot = Depot(**data, location=point_wkt(lat, lng))
    db.add(depot)
    db.commit()
    db.refresh(depot)
    return _to_read(depot)
