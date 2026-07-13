from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.geo import point_to_latlng, point_wkt
from app.models.customer import Customer
from app.schemas.customer import CustomerCreate, CustomerRead

router = APIRouter(prefix="/customers", tags=["customers"])


def _to_read(c: Customer) -> CustomerRead:
    lat, lng = point_to_latlng(c.location)
    return CustomerRead(
        id=c.id, name=c.name, rnc=c.rnc, phone=c.phone, address=c.address,
        lat=lat, lng=lng, notes=c.notes,
    )


@router.get("", response_model=list[CustomerRead])
def list_customers(db: Session = Depends(get_db)):
    customers = db.scalars(select(Customer)).all()
    return [_to_read(c) for c in customers]


@router.post("", response_model=CustomerRead, status_code=201)
def create_customer(payload: CustomerCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    lat, lng = data.pop("lat"), data.pop("lng")
    customer = Customer(**data, location=point_wkt(lat, lng))
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return _to_read(customer)
