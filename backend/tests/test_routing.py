import math

from app.services.routing import Point, haversine_km, optimize_route


def test_haversine_zero_distance_for_same_point():
    p = Point(id=1, lat=18.5, lng=-69.9)
    assert haversine_km(p, p) == 0.0


def test_haversine_known_distance_santo_domingo_santiago():
    # Santo Domingo (~18.4861,-69.9312) a Santiago (~19.4517,-70.6970): ~134 km en linea recta
    sd = Point(id=0, lat=18.4861, lng=-69.9312)
    stgo = Point(id=1, lat=19.4517, lng=-70.6970)
    d = haversine_km(sd, stgo)
    assert 125 < d < 145


def test_optimize_route_with_no_stops_returns_empty():
    depot = Point(id=0, lat=18.4173, lng=-70.0339)
    result = optimize_route(depot, [])
    assert result.ordered_stops == []
    assert result.total_distance_km == 0.0


def test_optimize_route_visits_all_stops_exactly_once():
    depot = Point(id=0, lat=18.4173, lng=-70.0339)
    stops = [
        Point(id=1, lat=18.497, lng=-69.8365),
        Point(id=2, lat=18.4527, lng=-69.6019),
        Point(id=3, lat=18.45, lng=-69.95),
    ]
    result = optimize_route(depot, stops)

    assert {p.id for p in result.ordered_stops} == {1, 2, 3}
    assert len(result.leg_distances_km) == 3
    assert math.isclose(sum(result.leg_distances_km), result.total_distance_km)


def test_optimize_route_prefers_nearest_first_over_naive_input_order():
    """Si las paradas se dan en el orden 'incorrecto' (la mas lejana primero),
    el optimizador debe re-ordenar y no limitarse a copiar el orden de entrada."""
    depot = Point(id=0, lat=0.0, lng=0.0)
    near = Point(id=1, lat=0.0, lng=1.0)
    far = Point(id=2, lat=0.0, lng=5.0)

    naive_order_distance = haversine_km(depot, far) + haversine_km(far, near)
    result = optimize_route(depot, [far, near])

    assert result.ordered_stops[0].id == 1  # visita primero la mas cercana
    assert result.total_distance_km < naive_order_distance
