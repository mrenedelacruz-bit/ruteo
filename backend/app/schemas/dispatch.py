from pydantic import BaseModel


class DispatchRequest(BaseModel):
    order_ids: list[int] | None = None  # None => todos los pedidos pendientes
    depot_id: int


class AllocationOut(BaseModel):
    order_id: int
    order_line_id: int
    product_code: str
    quantity: float
    compartment_id: int
    compartment_position: int


class StopOut(BaseModel):
    sequence: int
    order_id: int
    customer_name: str
    address: str
    lat: float
    lng: float
    distance_from_prev_km: float


class TripOut(BaseModel):
    truck_code: str
    total_distance_km: float
    allocations: list[AllocationOut]
    stops: list[StopOut]


class ShortfallOut(BaseModel):
    order_id: int
    order_line_id: int
    product_code: str
    quantity: float


class DispatchResult(BaseModel):
    trips: list[TripOut]
    unassigned_order_ids: list[int]
    shortfalls: list[ShortfallOut]
