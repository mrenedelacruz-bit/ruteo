"""Geocodificacion de direcciones usando Nominatim (OpenStreetMap).

Respetar la politica de uso de Nominatim: User-Agent identificable y bajo
volumen de consultas (esto es para busquedas puntuales al dar de alta un
cliente, no para geocodificacion masiva).
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.core.config import get_settings


@dataclass
class GeocodeResult:
    display_name: str
    lat: float
    lng: float


class GeocodingError(Exception):
    pass


def search_address(
    query: str, limit: int = 5, client: httpx.Client | None = None
) -> list[GeocodeResult]:
    settings = get_settings()
    params = {
        "q": query,
        "format": "json",
        "limit": str(limit),
        "countrycodes": settings.geocode_country_codes,
    }
    headers = {"User-Agent": settings.geocode_user_agent}

    own_client = client is None
    if own_client:
        client = httpx.Client(base_url=settings.nominatim_base_url, timeout=10)
    try:
        resp = client.get("/search", params=params, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPError as exc:
        raise GeocodingError(f"servicio de geocodificacion no disponible: {exc}") from exc
    finally:
        if own_client:
            client.close()

    return [
        GeocodeResult(
            display_name=item["display_name"],
            lat=float(item["lat"]),
            lng=float(item["lon"]),
        )
        for item in data
    ]
