from geoalchemy2.elements import WKTElement
from geoalchemy2.shape import to_shape


def point_wkt(lat: float, lng: float) -> WKTElement:
    return WKTElement(f"POINT({lng} {lat})", srid=4326)


def point_to_latlng(geom) -> tuple[float, float]:
    shape = to_shape(geom)
    return shape.y, shape.x
