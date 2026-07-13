"""Asignacion de lineas de pedido a compartimientos de camiones (bin-packing).

Reglas de negocio:
  - Un compartimiento tiene un producto dedicado (`product_id`); si es None es
    flexible y admite cualquier producto. Nunca se mezclan productos distintos
    en un mismo compartimiento dentro de un mismo viaje.
  - Una vez que un compartimiento recibe carga para un viaje, no se reutiliza
    para otra linea de pedido dentro del mismo viaje (se asume descarga total
    en la parada del cliente; evita fraccionar el mismo tanque entre clientes).
  - Si una linea de pedido excede la capacidad de cualquier compartimiento
    disponible, se divide (split) entre varios compartimientos/camiones.
  - Se prefiere consolidar pedidos en camiones ya utilizados en la misma
    corrida de despacho, para minimizar la cantidad de camiones/viajes.
"""

from __future__ import annotations

from dataclasses import dataclass, field

EPSILON = 1e-9


@dataclass
class Demand:
    order_id: int
    order_line_id: int
    product_id: int
    quantity: float


@dataclass
class CompartmentSlot:
    compartment_id: int
    position: int
    capacity: float
    product_id: int | None = None  # producto dedicado; None = flexible
    remaining: float = field(init=False)
    used: bool = field(default=False, init=False)

    def __post_init__(self) -> None:
        self.remaining = self.capacity

    def accepts(self, product_id: int) -> bool:
        return not self.used and (self.product_id is None or self.product_id == product_id)


@dataclass
class TruckSlots:
    truck_id: int
    truck_code: str
    compartments: list[CompartmentSlot]


@dataclass
class Allocation:
    order_id: int
    order_line_id: int
    product_id: int
    quantity: float
    truck_id: int
    truck_code: str
    compartment_id: int
    compartment_position: int


@dataclass
class AssignmentResult:
    allocations: list[Allocation]
    # demandas (o remanentes de una demanda dividida) que no pudieron ubicarse
    shortfalls: list[Demand]


def assign_orders_to_fleet(
    demands: list[Demand], trucks: list[TruckSlots]
) -> AssignmentResult:
    allocations: list[Allocation] = []
    shortfalls: list[Demand] = []
    used_truck_ids: set[int] = set()

    sorted_demands = sorted(demands, key=lambda d: d.quantity, reverse=True)

    for demand in sorted_demands:
        remaining = demand.quantity

        while remaining > EPSILON:
            candidates = [
                (truck, comp)
                for truck in trucks
                for comp in truck.compartments
                if comp.remaining > EPSILON and comp.accepts(demand.product_id)
            ]
            if not candidates:
                break

            # Preferir camiones ya usados en esta corrida (consolidar viajes),
            # y dentro de eso el mejor ajuste (compartimiento mas pequeno que
            # alcance a cubrir todo lo que falta).
            fits_fully = [c for c in candidates if c[1].remaining >= remaining - EPSILON]
            if fits_fully:
                fits_fully.sort(
                    key=lambda tc: (tc[0].truck_id not in used_truck_ids, tc[1].remaining)
                )
                truck, comp = fits_fully[0]
                qty = remaining
            else:
                # No hay compartimiento que cubra todo: usar el mas grande
                # disponible para minimizar el numero de fracciones.
                candidates.sort(
                    key=lambda tc: (tc[0].truck_id not in used_truck_ids, -tc[1].remaining)
                )
                truck, comp = candidates[0]
                qty = comp.remaining

            allocations.append(
                Allocation(
                    order_id=demand.order_id,
                    order_line_id=demand.order_line_id,
                    product_id=demand.product_id,
                    quantity=qty,
                    truck_id=truck.truck_id,
                    truck_code=truck.truck_code,
                    compartment_id=comp.compartment_id,
                    compartment_position=comp.position,
                )
            )
            comp.remaining -= qty
            comp.used = True
            remaining -= qty
            used_truck_ids.add(truck.truck_id)

        if remaining > EPSILON:
            shortfalls.append(
                Demand(
                    order_id=demand.order_id,
                    order_line_id=demand.order_line_id,
                    product_id=demand.product_id,
                    quantity=remaining,
                )
            )

    return AssignmentResult(allocations=allocations, shortfalls=shortfalls)
