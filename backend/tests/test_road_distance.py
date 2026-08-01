import httpx
import pytest

from app.services.road_distance import build_osrm_distance_fn
from app.services.routing import Point

DEPOT = Point(id=0, lat=18.4173, lng=-70.0339)
STOP_A = Point(id=1, lat=18.497, lng=-69.8365)
STOP_B = Point(id=2, lat=18.4527, lng=-69.6019)


def make_client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler), base_url="https://osrm.test")


def test_returns_distance_fn_backed_by_osrm_matrix():
    def handler(request: httpx.Request) -> httpx.Response:
        # coordenadas en orden lng,lat separadas por ';'
        assert request.url.path.endswith("-70.0339,18.4173;-69.8365,18.497;-69.6019,18.4527")
        assert request.url.params["annotations"] == "distance"
        return httpx.Response(
            200,
            json={
                "code": "Ok",
                "distances": [
                    [0, 30000, 52000],
                    [30500, 0, 27000],
                    [52500, 27500, 0],
                ],
            },
        )

    fn = build_osrm_distance_fn([DEPOT, STOP_A, STOP_B], client=make_client(handler))

    assert fn is not None
    assert fn(DEPOT, STOP_A) == pytest.approx(30.0)
    assert fn(STOP_A, STOP_B) == pytest.approx(27.0)
    # la matriz es asimetrica (sentidos de via distintos) y debe respetarse
    assert fn(STOP_A, DEPOT) == pytest.approx(30.5)


def test_returns_none_when_osrm_unreachable():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    assert build_osrm_distance_fn([DEPOT, STOP_A], client=make_client(handler)) is None


def test_returns_none_when_osrm_reports_error_code():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"code": "NoTable", "message": "boom"})

    assert build_osrm_distance_fn([DEPOT, STOP_A], client=make_client(handler)) is None


def test_distance_fn_raises_on_unroutable_pair():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"code": "Ok", "distances": [[0, None], [None, 0]]},
        )

    fn = build_osrm_distance_fn([DEPOT, STOP_A], client=make_client(handler))
    assert fn is not None
    with pytest.raises(ValueError):
        fn(DEPOT, STOP_A)


def test_returns_none_with_fewer_than_two_points():
    assert build_osrm_distance_fn([DEPOT]) is None
