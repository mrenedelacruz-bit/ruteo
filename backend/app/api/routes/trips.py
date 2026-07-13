from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.db import get_db
from app.models.order import Order, OrderLine
from app.models.trip import CompartmentAllocation, Trip, TripStatus, TripStop
from app.schemas.trip import TripAllocationRead, TripRead, TripStopRead
from app.services.trip_flow import TripTransitionError, cancel_trip, deliver_stop, start_trip

router = APIRouter(prefix="/trips", tags=["trips"])

_LOAD = (
    selectinload(Trip.stops).selectinload(TripStop.order).selectinload(Order.customer),
    selectinload(Trip.allocations)
    .selectinload(CompartmentAllocation.order_line)
    .selectinload(OrderLine.product),
    selectinload(Trip.allocations)
    .selectinload(CompartmentAllocation.compartment),
    selectinload(Trip.truck),
)


def _to_read(trip: Trip) -> TripRead:
    return TripRead(
        id=trip.id,
        truck_code=trip.truck.code,
        status=trip.status,
        created_at=trip.created_at,
        total_distance_km=float(trip.total_distance_km) if trip.total_distance_km is not None else None,
        stops=[
            TripStopRead(
                id=s.id,
                sequence=s.sequence,
                order_id=s.order_id,
                customer_name=s.order.customer.name,
                address=s.order.customer.address,
                distance_from_prev_km=float(s.distance_from_prev_km) if s.distance_from_prev_km is not None else None,
                delivered_at=s.delivered_at,
            )
            for s in trip.stops
        ],
        allocations=[
            TripAllocationRead(
                compartment_position=a.compartment.position,
                product_code=a.order_line.product.code,
                quantity=float(a.quantity),
                order_id=a.order_line.order_id,
            )
            for a in trip.allocations
        ],
    )


def _get_trip(trip_id: int, db: Session) -> Trip:
    trip = db.scalar(select(Trip).options(*_LOAD).where(Trip.id == trip_id))
    if trip is None:
        raise HTTPException(404, "viaje no encontrado")
    return trip


@router.get("", response_model=list[TripRead])
def list_trips(status: TripStatus | None = None, db: Session = Depends(get_db)):
    stmt = select(Trip).options(*_LOAD).order_by(Trip.id.desc())
    if status is not None:
        stmt = stmt.where(Trip.status == status)
    return [_to_read(t) for t in db.scalars(stmt).all()]


@router.post("/{trip_id}/start", response_model=TripRead)
def start(trip_id: int, db: Session = Depends(get_db)):
    trip = _get_trip(trip_id, db)
    try:
        start_trip(trip)
    except TripTransitionError as exc:
        raise HTTPException(409, str(exc)) from exc
    db.commit()
    return _to_read(_get_trip(trip_id, db))


@router.post("/{trip_id}/stops/{stop_id}/deliver", response_model=TripRead)
def deliver(trip_id: int, stop_id: int, db: Session = Depends(get_db)):
    trip = _get_trip(trip_id, db)
    stop = next((s for s in trip.stops if s.id == stop_id), None)
    if stop is None:
        raise HTTPException(404, "parada no encontrada en este viaje")
    try:
        deliver_stop(trip, stop)
    except TripTransitionError as exc:
        raise HTTPException(409, str(exc)) from exc
    db.commit()
    return _to_read(_get_trip(trip_id, db))


@router.post("/{trip_id}/cancel", response_model=TripRead)
def cancel(trip_id: int, db: Session = Depends(get_db)):
    trip = _get_trip(trip_id, db)
    try:
        cancel_trip(trip)
    except TripTransitionError as exc:
        raise HTTPException(409, str(exc)) from exc
    db.commit()
    return _to_read(_get_trip(trip_id, db))
