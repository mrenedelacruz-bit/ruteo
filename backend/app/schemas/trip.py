from datetime import datetime

from pydantic import BaseModel

from app.models.trip import TripStatus


class TripStopRead(BaseModel):
    id: int
    sequence: int
    order_id: int
    customer_name: str
    address: str
    distance_from_prev_km: float | None
    delivered_at: datetime | None


class TripAllocationRead(BaseModel):
    compartment_position: int
    product_code: str
    quantity: float
    order_id: int


class TripRead(BaseModel):
    id: int
    truck_code: str
    status: TripStatus
    created_at: datetime
    total_distance_km: float | None
    stops: list[TripStopRead]
    allocations: list[TripAllocationRead]
