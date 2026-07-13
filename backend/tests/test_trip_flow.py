import pytest

from app.models.customer import Customer
from app.models.order import Order, OrderStatus
from app.models.trip import Trip, TripStatus, TripStop
from app.services.trip_flow import TripTransitionError, cancel_trip, deliver_stop, start_trip


def make_trip(n_stops=2) -> Trip:
    trip = Trip(id=1, truck_id=1, depot_id=1, status=TripStatus.planned)
    trip.stops = []
    for i in range(n_stops):
        order = Order(id=i + 1, customer_id=i + 1, status=OrderStatus.assigned)
        order.customer = Customer(id=i + 1, name=f"Cliente {i+1}", address="X")
        stop = TripStop(id=i + 1, trip_id=1, order_id=order.id, sequence=i + 1)
        stop.order = order
        trip.stops.append(stop)
    return trip


def test_start_marks_orders_dispatched():
    trip = make_trip()
    start_trip(trip)
    assert trip.status == TripStatus.in_progress
    assert all(s.order.status == OrderStatus.dispatched for s in trip.stops)


def test_cannot_start_twice():
    trip = make_trip()
    start_trip(trip)
    with pytest.raises(TripTransitionError):
        start_trip(trip)


def test_deliver_marks_order_delivered_and_completes_on_last_stop():
    trip = make_trip(n_stops=2)
    start_trip(trip)

    deliver_stop(trip, trip.stops[0])
    assert trip.stops[0].order.status == OrderStatus.delivered
    assert trip.stops[0].delivered_at is not None
    assert trip.status == TripStatus.in_progress  # queda una parada

    deliver_stop(trip, trip.stops[1])
    assert trip.status == TripStatus.completed


def test_cannot_deliver_before_starting():
    trip = make_trip()
    with pytest.raises(TripTransitionError):
        deliver_stop(trip, trip.stops[0])


def test_cannot_deliver_same_stop_twice():
    trip = make_trip()
    start_trip(trip)
    deliver_stop(trip, trip.stops[0])
    with pytest.raises(TripTransitionError):
        deliver_stop(trip, trip.stops[0])


def test_cancel_returns_undelivered_orders_to_pending():
    trip = make_trip(n_stops=2)
    start_trip(trip)
    deliver_stop(trip, trip.stops[0])

    cancel_trip(trip)

    assert trip.status == TripStatus.cancelled
    assert trip.stops[0].order.status == OrderStatus.delivered  # lo entregado no se revierte
    assert trip.stops[1].order.status == OrderStatus.pending


def test_cannot_cancel_completed_trip():
    trip = make_trip(n_stops=1)
    start_trip(trip)
    deliver_stop(trip, trip.stops[0])
    assert trip.status == TripStatus.completed
    with pytest.raises(TripTransitionError):
        cancel_trip(trip)
