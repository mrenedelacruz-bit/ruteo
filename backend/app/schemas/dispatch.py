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
    """Producto que ningun camion activo de la flota puede transportar
    (ni dedicado ni flexible) — a diferencia de un pedido en
    `unassigned_order_ids` (simplemente esperando a que se complete un
    camion), esto no se resuelve con mas pedidos."""

    order_id: int
    order_line_id: int
    product_code: str
    quantity: float


class DispatchResult(BaseModel):
    trips: list[TripOut]
    # pedidos que no salieron en esta corrida porque ningun camion pudo
    # completarse a capacidad todavia (quedan pendientes para la proxima)
    unassigned_order_ids: list[int]
    shortfalls: list[ShortfallOut]


class CompartmentLoadOut(BaseModel):
    compartment_id: int
    position: int
    capacity: float
    dedicated_product_code: str | None  # None = compartimiento flexible
    filled: bool
    # producto asignado (si filled) o el mejor candidato disponible ahora
    # mismo (si no); None si no hay ninguna demanda que le sirva todavia
    product_code: str | None
    quantity_available: float
    quantity_missing: float


class TruckLoadOut(BaseModel):
    truck_code: str
    total_capacity: float
    ready_to_dispatch: bool
    compartments: list[CompartmentLoadOut]
