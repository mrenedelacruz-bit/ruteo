"""Transiciones de estado de un viaje y sincronizacion con los pedidos.

Ciclo de vida:
    planned --start--> in_progress --(todas las paradas entregadas)--> completed
    planned/in_progress --cancel--> cancelled

Sincronizacion con pedidos:
    start   -> pedidos del viaje pasan a `dispatched`
    deliver -> el pedido de esa parada pasa a `delivered`; si era la ultima
               parada pendiente, el viaje pasa a `completed`
    cancel  -> pedidos no entregados vuelven a `pending` para poder
               re-despacharlos en otra corrida
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.models.order import OrderStatus
from app.models.trip import Trip, TripStatus, TripStop


class TripTransitionError(Exception):
    pass


def start_trip(trip: Trip) -> None:
    if trip.status != TripStatus.planned:
        raise TripTransitionError(f"solo se puede iniciar un viaje planificado (estado actual: {trip.status.value})")
    trip.status = TripStatus.in_progress
    for stop in trip.stops:
        stop.order.status = OrderStatus.dispatched


def deliver_stop(trip: Trip, stop: TripStop, *, order_fully_delivered: bool = True) -> None:
    """`order_fully_delivered`: False cuando el pedido de esta parada esta
    dividido en otro viaje activo que aun no entrega su parte — en ese
    caso el pedido no debe marcarse `delivered` todavia (lo marcara la
    entrega de la ultima parte)."""
    if trip.status != TripStatus.in_progress:
        raise TripTransitionError(f"el viaje no esta en ruta (estado actual: {trip.status.value})")
    if stop.trip_id != trip.id:
        raise TripTransitionError("la parada no pertenece a este viaje")
    if stop.delivered_at is not None:
        raise TripTransitionError("esta parada ya fue entregada")

    stop.delivered_at = datetime.now(timezone.utc).replace(tzinfo=None)
    if order_fully_delivered:
        stop.order.status = OrderStatus.delivered

    if all(s.delivered_at is not None for s in trip.stops):
        trip.status = TripStatus.completed


def cancel_trip(trip: Trip, *, orders_on_other_active_trips: frozenset[int] = frozenset()) -> None:
    """`orders_on_other_active_trips`: pedidos de este viaje que tambien
    viajan (divididos) en otro viaje aun activo — esos NO vuelven a
    `pending` (siguen comprometidos con el otro viaje); devolverlos haria
    que un proximo despacho los re-asignara completos y se entregara
    doble."""
    if trip.status not in (TripStatus.planned, TripStatus.in_progress):
        raise TripTransitionError(f"no se puede cancelar un viaje {trip.status.value}")
    trip.status = TripStatus.cancelled
    for stop in trip.stops:
        if stop.delivered_at is None and stop.order_id not in orders_on_other_active_trips:
            stop.order.status = OrderStatus.pending
