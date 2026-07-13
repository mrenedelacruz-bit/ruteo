"""Orquesta la generacion de despachos: toma pedidos pendientes, los asigna a
la flota disponible (services.assignment) y calcula la ruta de entrega de
cada camion (services.routing), persistiendo Trip/TripStop/CompartmentAllocation.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.geo import point_to_latlng
from app.models.depot import Depot
from app.models.order import Order, OrderLine, OrderStatus
from app.models.trip import CompartmentAllocation, Trip, TripStop
from app.models.truck import Truck, TruckStatus
from app.schemas.dispatch import AllocationOut, DispatchResult, ShortfallOut, StopOut, TripOut
from app.services.assignment import CompartmentSlot, Demand, TruckSlots, assign_orders_to_fleet
from app.services.road_distance import build_osrm_distance_fn
from app.services.routing import Point, RouteResult, haversine_km, optimize_route


def _route_with_best_distances(depot: Point, stops: list[Point]) -> RouteResult:
    """Rutea con distancias viales reales (OSRM) si el servicio esta
    disponible; si no, cae a distancia geodesica (haversine)."""
    osrm_fn = build_osrm_distance_fn([depot, *stops])
    if osrm_fn is not None:
        try:
            return optimize_route(depot, stops, distance_fn=osrm_fn)
        except ValueError:
            pass  # algun par de puntos sin ruta vial; usar haversine
    return optimize_route(depot, stops, distance_fn=haversine_km)


def generate_dispatch(
    db: Session, depot_id: int, order_ids: list[int] | None
) -> DispatchResult:
    depot = db.get(Depot, depot_id)
    if depot is None:
        raise ValueError(f"deposito {depot_id} no encontrado")

    order_stmt = (
        select(Order)
        .options(selectinload(Order.lines).selectinload(OrderLine.product), selectinload(Order.customer))
        .where(Order.status == OrderStatus.pending)
    )
    if order_ids is not None:
        order_stmt = order_stmt.where(Order.id.in_(order_ids))
    orders = list(db.scalars(order_stmt).all())
    orders_by_id = {o.id: o for o in orders}

    demands = [
        Demand(order_id=o.id, order_line_id=line.id, product_id=line.product_id, quantity=float(line.quantity))
        for o in orders
        for line in o.lines
    ]
    line_product_code = {line.id: line.product.code for o in orders for line in o.lines}

    trucks = db.scalars(
        select(Truck).options(selectinload(Truck.compartments)).where(Truck.status == TruckStatus.active)
    ).all()
    truck_slots = [
        TruckSlots(
            truck_id=t.id,
            truck_code=t.code,
            compartments=[
                CompartmentSlot(
                    compartment_id=c.id, position=c.position, capacity=float(c.capacity), product_id=c.product_id
                )
                for c in t.compartments
            ],
        )
        for t in trucks
    ]

    result = assign_orders_to_fleet(demands, truck_slots)

    allocations_by_truck: dict[int, list] = {}
    for alloc in result.allocations:
        allocations_by_truck.setdefault(alloc.truck_id, []).append(alloc)

    depot_lat, depot_lng = point_to_latlng(depot.location)
    depot_point = Point(id=0, lat=depot_lat, lng=depot_lng)

    trip_outs: list[TripOut] = []
    assigned_order_ids: set[int] = set()

    for truck_id, allocs in allocations_by_truck.items():
        truck_code = allocs[0].truck_code
        order_ids_for_truck = sorted({a.order_id for a in allocs})
        assigned_order_ids.update(order_ids_for_truck)

        stop_points = []
        for oid in order_ids_for_truck:
            order = orders_by_id[oid]
            lat, lng = point_to_latlng(order.customer.location)
            stop_points.append(Point(id=oid, lat=lat, lng=lng))

        route = _route_with_best_distances(depot_point, stop_points)

        trip = Trip(truck_id=truck_id, depot_id=depot_id, total_distance_km=route.total_distance_km)
        db.add(trip)
        db.flush()  # obtener trip.id

        for alloc in allocs:
            db.add(
                CompartmentAllocation(
                    trip_id=trip.id,
                    compartment_id=alloc.compartment_id,
                    order_line_id=alloc.order_line_id,
                    quantity=alloc.quantity,
                )
            )

        stops_out: list[StopOut] = []
        for seq, (point, leg_km) in enumerate(zip(route.ordered_stops, route.leg_distances_km), start=1):
            order = orders_by_id[point.id]
            order.status = OrderStatus.assigned
            db.add(TripStop(trip_id=trip.id, order_id=point.id, sequence=seq, distance_from_prev_km=leg_km))
            stops_out.append(
                StopOut(
                    sequence=seq,
                    order_id=point.id,
                    customer_name=order.customer.name,
                    address=order.customer.address,
                    lat=point.lat,
                    lng=point.lng,
                    distance_from_prev_km=leg_km,
                )
            )

        trip_outs.append(
            TripOut(
                truck_code=truck_code,
                total_distance_km=route.total_distance_km,
                allocations=[
                    AllocationOut(
                        order_id=a.order_id,
                        order_line_id=a.order_line_id,
                        product_code=line_product_code[a.order_line_id],
                        quantity=a.quantity,
                        compartment_id=a.compartment_id,
                        compartment_position=a.compartment_position,
                    )
                    for a in allocs
                ],
                stops=stops_out,
            )
        )

    unassigned_order_ids = sorted({o.id for o in orders} - assigned_order_ids)
    shortfalls_out = [
        ShortfallOut(
            order_id=s.order_id,
            order_line_id=s.order_line_id,
            product_code=line_product_code[s.order_line_id],
            quantity=s.quantity,
        )
        for s in result.shortfalls
    ]

    db.commit()

    return DispatchResult(trips=trip_outs, unassigned_order_ids=unassigned_order_ids, shortfalls=shortfalls_out)
