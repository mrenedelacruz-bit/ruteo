"""Distancias viales reales via OSRM (Open Source Routing Machine).

Obtiene una matriz de distancias por carretera entre todos los puntos de un
viaje (deposito + paradas) con una sola llamada al servicio /table de OSRM,
y la expone como una `DistanceFn` compatible con `app.services.routing`.

Si OSRM no esta configurado o no responde, el llamador debe usar el fallback
(`haversine_km`); por eso `build_osrm_distance_fn` devuelve None en vez de
lanzar, y deja el fallo registrado en el log.
"""

from __future__ import annotations

import logging

import httpx

from app.core.config import get_settings
from app.services.routing import DistanceFn, Point

logger = logging.getLogger(__name__)


def build_osrm_distance_fn(
    points: list[Point], client: httpx.Client | None = None
) -> DistanceFn | None:
    """Devuelve una DistanceFn respaldada por la matriz /table de OSRM,
    o None si el servicio no esta configurado o no responde."""
    settings = get_settings()
    if not settings.osrm_base_url or len(points) < 2:
        return None

    coords = ";".join(f"{p.lng},{p.lat}" for p in points)
    own_client = client is None
    if own_client:
        client = httpx.Client(base_url=settings.osrm_base_url, timeout=15)
    try:
        resp = client.get(f"/table/v1/driving/{coords}", params={"annotations": "distance"})
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != "Ok":
            raise ValueError(f"OSRM respondio code={data.get('code')}")
        matrix = data["distances"]  # metros, indexada igual que `points`
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        logger.warning("OSRM no disponible, usando distancia haversine: %s", exc)
        return None
    finally:
        if own_client:
            client.close()

    index_of = {p.id: i for i, p in enumerate(points)}

    def distance_km(a: Point, b: Point) -> float:
        meters = matrix[index_of[a.id]][index_of[b.id]]
        if meters is None:
            raise ValueError(f"OSRM no tiene ruta entre puntos {a.id} y {b.id}")
        return meters / 1000.0

    return distance_km
