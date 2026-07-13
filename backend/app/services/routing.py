"""Ruteo de paradas de entrega dentro de un viaje.

Usa una heuristica clasica de TSP (vecino mas cercano + mejora 2-opt) sobre
distancias geodesicas (haversine). La funcion de distancia es un parametro
inyectable (`distance_fn`) para poder sustituirla en el futuro por distancias
de red vial reales via un motor externo (p.ej. OSRM) sin tocar el algoritmo.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass

EARTH_RADIUS_KM = 6371.0088


@dataclass(frozen=True)
class Point:
    id: int  # 0 = deposito/origen; >0 = order_id de la parada
    lat: float
    lng: float


DistanceFn = Callable[[Point, Point], float]


def haversine_km(a: Point, b: Point) -> float:
    lat1, lng1, lat2, lng2 = map(math.radians, (a.lat, a.lng, b.lat, b.lng))
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


@dataclass
class RouteResult:
    ordered_stops: list[Point]  # sin incluir el deposito
    leg_distances_km: list[float]  # distancia de cada tramo, alineada con ordered_stops
    total_distance_km: float


def _tour_length(depot: Point, order: list[Point], distance_fn: DistanceFn) -> float:
    total = 0.0
    prev = depot
    for p in order:
        total += distance_fn(prev, p)
        prev = p
    return total


def _nearest_neighbor(depot: Point, stops: list[Point], distance_fn: DistanceFn) -> list[Point]:
    remaining = list(stops)
    route: list[Point] = []
    current = depot
    while remaining:
        nxt = min(remaining, key=lambda p: distance_fn(current, p))
        route.append(nxt)
        remaining.remove(nxt)
        current = nxt
    return route


def _two_opt(depot: Point, route: list[Point], distance_fn: DistanceFn) -> list[Point]:
    if len(route) < 3:
        return route

    best = route
    best_len = _tour_length(depot, best, distance_fn)
    improved = True
    while improved:
        improved = False
        for i in range(len(best) - 1):
            for j in range(i + 1, len(best)):
                candidate = best[:i] + list(reversed(best[i : j + 1])) + best[j + 1 :]
                candidate_len = _tour_length(depot, candidate, distance_fn)
                if candidate_len + 1e-9 < best_len:
                    best, best_len = candidate, candidate_len
                    improved = True
    return best


def optimize_route(
    depot: Point, stops: list[Point], distance_fn: DistanceFn = haversine_km
) -> RouteResult:
    if not stops:
        return RouteResult(ordered_stops=[], leg_distances_km=[], total_distance_km=0.0)

    initial = _nearest_neighbor(depot, stops, distance_fn)
    ordered = _two_opt(depot, initial, distance_fn)

    legs: list[float] = []
    prev = depot
    for p in ordered:
        legs.append(distance_fn(prev, p))
        prev = p

    return RouteResult(ordered_stops=ordered, leg_distances_km=legs, total_distance_km=sum(legs))
