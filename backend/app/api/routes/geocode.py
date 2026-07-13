from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.geocoding import GeocodingError, search_address

router = APIRouter(prefix="/geocode", tags=["geocode"])


class GeocodeOut(BaseModel):
    display_name: str
    lat: float
    lng: float


@router.get("", response_model=list[GeocodeOut])
def geocode(q: str = Query(min_length=3), limit: int = Query(default=5, le=10)):
    try:
        results = search_address(q, limit=limit)
    except GeocodingError as exc:
        raise HTTPException(502, str(exc)) from exc
    return [GeocodeOut(display_name=r.display_name, lat=r.lat, lng=r.lng) for r in results]
