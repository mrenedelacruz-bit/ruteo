"""Asignacion de pedidos a viajes completos (bin-packing con llenado exacto).

Reglas de negocio del cliente:
  - Un camion solo sale cuando esta completo a capacidad: **todos** sus
    compartimientos deben quedar llenos exactamente a su capacidad, o el
    camion no se despacha en esta corrida. Sus pedidos quedan pendientes
    para una proxima corrida, cuando haya mas demanda acumulada.
  - Un compartimiento con producto dedicado solo admite ese producto; uno
    flexible (product_id=None, p.ej. los del camion "WOP") admite
    cualquier producto, y esa eleccion puede variar de un viaje a otro.
  - El pedido de un cliente con varios combustibles se intenta consolidar
    en un mismo camion (una linea por compartimiento); si no cabe
    completo se reparte entre varios camiones.
  - Una linea de pedido es divisible: su cantidad puede repartirse entre
    varios compartimientos/camiones, y un compartimiento puede llenarse
    combinando varias lineas (incluso de pedidos distintos) hasta
    completar exactamente su capacidad.

Heuristica: los camiones se procesan de menor a mayor capacidad total (los
mas chicos necesitan menos demanda acumulada para completarse) y, dentro
de cada camion, sus compartimientos dedicados antes que los flexibles.
Encontrar el maximo global de camiones despachables es un problema
NP-dificil en general (equivale a particionar la demanda en subconjuntos
exactos); esta heuristica es determinista y razonable para los volumenes
tipicos de esta operacion, pero no garantiza el optimo.

`assign_orders_to_fleet` (el despacho real) y `fleet_loading_status` (una
vista previa de solo lectura de como se van llenando los camiones, y que
les falta) comparten el mismo recorrido via `_attempt_truck`, para que la
vista previa sea siempre consistente con lo que produciria un despacho
real en ese momento.
"""

from __future__ import annotations

from dataclasses import dataclass

EPSILON = 1e-6


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

    def accepts(self, product_id: int) -> bool:
        return self.product_id is None or self.product_id == product_id


@dataclass
class TruckSlots:
    truck_id: int
    truck_code: str
    compartments: list[CompartmentSlot]

    @property
    def total_capacity(self) -> float:
        return sum(c.capacity for c in self.compartments)


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
    # Demanda de un producto que ningun compartimiento de la flota activa
    # (ni dedicado ni flexible) puede transportar. A diferencia de un
    # pedido simplemente pendiente por falta de volumen acumulado
    # (que no aparece aqui, solo no sale en `allocations`), esto no se
    # resuelve con mas pedidos: hace falta ajustar la flota.
    shortfalls: list[Demand]


@dataclass
class CompartmentStatus:
    compartment: CompartmentSlot
    filled: bool
    plan: list[tuple[int, float]]  # (order_line_id, cantidad) tomados si filled=True
    candidate_product_id: int | None  # producto asignado (filled) o mejor candidato disponible
    quantity_available: float  # cuanto hay disponible de ese producto ahora mismo
    quantity_missing: float  # 0.0 si filled=True


@dataclass
class TruckAttempt:
    truck: TruckSlots
    complete: bool
    compartments: list[CompartmentStatus]
    remaining_after: dict[int, float]  # pool resultante si se comitea (solo si complete=True)


@dataclass
class TruckLoadStatus:
    truck_id: int
    truck_code: str
    total_capacity: float
    ready_to_dispatch: bool
    compartments: list[CompartmentStatus]


def _fill_compartment(
    compartment: CompartmentSlot,
    demand_lookup: dict[int, Demand],
    remaining: dict[int, float],
    preferred_order_ids: set[int],
) -> list[tuple[int, float]] | None:
    """Intenta cubrir exactamente la capacidad del compartimiento
    combinando demanda de un UNICO producto (posiblemente fraccionando
    varias lineas de ese producto — nunca se mezclan productos distintos
    en un mismo compartimiento, ni siquiera uno flexible). Devuelve una
    lista de (order_line_id, cantidad_tomada), o None si ningun producto
    disponible alcanza a llenarlo exacto. No modifica `remaining`.
    """
    eligible = [
        d
        for d in demand_lookup.values()
        if remaining.get(d.order_line_id, 0.0) > EPSILON and compartment.accepts(d.product_id)
    ]
    if not eligible:
        return None

    candidate_products = sorted({d.product_id for d in eligible})

    best_plan: list[tuple[int, float]] | None = None
    best_score = -1
    for product_id in candidate_products:
        same_product = [d for d in eligible if d.product_id == product_id]
        if sum(remaining[d.order_line_id] for d in same_product) < compartment.capacity - EPSILON:
            continue

        # Prioridad: lineas de pedidos que ya tienen otra linea en este
        # mismo camion (consolidar el pedido de un cliente), luego FIFO.
        same_product.sort(key=lambda d: (d.order_id not in preferred_order_ids, d.order_id, d.order_line_id))

        needed = compartment.capacity
        taken: list[tuple[int, float]] = []
        for d in same_product:
            if needed <= EPSILON:
                break
            take = min(remaining[d.order_line_id], needed)
            taken.append((d.order_line_id, take))
            needed -= take

        score = sum(1 for line_id, _ in taken if demand_lookup[line_id].order_id in preferred_order_ids)
        if score > best_score:
            best_score, best_plan = score, taken

    return best_plan


def _compartment_diagnostic(
    compartment: CompartmentSlot, demand_lookup: dict[int, Demand], remaining: dict[int, float]
) -> tuple[int, float] | None:
    """Para un compartimiento que no se pudo llenar del todo: el producto
    candidato con mas demanda disponible y cuanta hay, o None si no hay
    ninguna demanda que le sirva a este compartimiento en este momento."""
    eligible = [
        d
        for d in demand_lookup.values()
        if remaining.get(d.order_line_id, 0.0) > EPSILON and compartment.accepts(d.product_id)
    ]
    if not eligible:
        return None
    totals: dict[int, float] = {}
    for d in eligible:
        totals[d.product_id] = totals.get(d.product_id, 0.0) + remaining[d.order_line_id]
    return max(totals.items(), key=lambda kv: kv[1])


def _attempt_truck(
    truck: TruckSlots,
    demand_lookup: dict[int, Demand],
    remaining: dict[int, float],
    *,
    stop_at_first_failure: bool,
) -> TruckAttempt:
    # Compartimientos dedicados primero (fijan su producto especifico
    # antes de que uno flexible pueda tomar esa misma demanda).
    compartments = sorted(truck.compartments, key=lambda c: (c.product_id is None, -c.capacity))

    trial_remaining = dict(remaining)
    preferred_order_ids: set[int] = set()
    statuses: list[CompartmentStatus] = []
    complete = True

    for comp in compartments:
        plan = _fill_compartment(comp, demand_lookup, trial_remaining, preferred_order_ids)
        if plan is not None:
            for line_id, qty in plan:
                trial_remaining[line_id] -= qty
                preferred_order_ids.add(demand_lookup[line_id].order_id)
            statuses.append(
                CompartmentStatus(
                    compartment=comp,
                    filled=True,
                    plan=plan,
                    candidate_product_id=demand_lookup[plan[0][0]].product_id,
                    quantity_available=comp.capacity,
                    quantity_missing=0.0,
                )
            )
            continue

        complete = False
        diag = _compartment_diagnostic(comp, demand_lookup, trial_remaining)
        if diag is None:
            statuses.append(
                CompartmentStatus(
                    compartment=comp,
                    filled=False,
                    plan=[],
                    candidate_product_id=None,
                    quantity_available=0.0,
                    quantity_missing=comp.capacity,
                )
            )
        else:
            product_id, available = diag
            statuses.append(
                CompartmentStatus(
                    compartment=comp,
                    filled=False,
                    plan=[],
                    candidate_product_id=product_id,
                    quantity_available=available,
                    quantity_missing=max(0.0, comp.capacity - available),
                )
            )
        if stop_at_first_failure:
            break

    return TruckAttempt(truck=truck, complete=complete, compartments=statuses, remaining_after=trial_remaining)


def assign_orders_to_fleet(demands: list[Demand], trucks: list[TruckSlots]) -> AssignmentResult:
    demand_lookup = {d.order_line_id: d for d in demands}
    remaining = {d.order_line_id: d.quantity for d in demands}

    dedicated_products = {
        c.product_id for t in trucks for c in t.compartments if c.product_id is not None
    }
    has_flexible_compartment = any(c.product_id is None for t in trucks for c in t.compartments)

    shortfalls = [
        d for d in demands if d.product_id not in dedicated_products and not has_flexible_compartment
    ]
    for d in shortfalls:
        remaining.pop(d.order_line_id, None)

    allocations: list[Allocation] = []

    for truck in sorted(trucks, key=lambda t: t.total_capacity):
        attempt = _attempt_truck(truck, demand_lookup, remaining, stop_at_first_failure=True)
        if not attempt.complete:
            continue  # este camion no se completa todavia; se reintenta en otra corrida

        remaining = attempt.remaining_after
        for status in attempt.compartments:
            for line_id, qty in status.plan:
                d = demand_lookup[line_id]
                allocations.append(
                    Allocation(
                        order_id=d.order_id,
                        order_line_id=d.order_line_id,
                        product_id=d.product_id,
                        quantity=qty,
                        truck_id=truck.truck_id,
                        truck_code=truck.truck_code,
                        compartment_id=status.compartment.compartment_id,
                        compartment_position=status.compartment.position,
                    )
                )

    return AssignmentResult(allocations=allocations, shortfalls=shortfalls)


def fleet_loading_status(demands: list[Demand], trucks: list[TruckSlots]) -> list[TruckLoadStatus]:
    """Vista previa de solo lectura: para cada camion activo, el estado de
    cada compartimiento (lleno o cuanto le falta) segun la demanda
    pendiente actual. Sigue el mismo orden y logica de consumo que
    `assign_orders_to_fleet`, asi que un camion `ready_to_dispatch=True`
    aqui es exactamente el que saldria en el proximo despacho real."""
    demand_lookup = {d.order_line_id: d for d in demands}
    remaining = {d.order_line_id: d.quantity for d in demands}

    results: list[TruckLoadStatus] = []
    for truck in sorted(trucks, key=lambda t: t.total_capacity):
        attempt = _attempt_truck(truck, demand_lookup, remaining, stop_at_first_failure=False)
        results.append(
            TruckLoadStatus(
                truck_id=truck.truck_id,
                truck_code=truck.truck_code,
                total_capacity=truck.total_capacity,
                ready_to_dispatch=attempt.complete,
                compartments=attempt.compartments,
            )
        )
        if attempt.complete:
            remaining = attempt.remaining_after

    return results
