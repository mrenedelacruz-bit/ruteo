import httpx
import pytest

from app.services.geocoding import GeocodingError, search_address


def make_client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler), base_url="https://nominatim.test")


def test_search_address_parses_results():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["q"] == "Av. Duarte 100, Santo Domingo"
        assert request.url.params["countrycodes"] == "do"
        return httpx.Response(
            200,
            json=[
                {"display_name": "Av. Duarte 100, Santo Domingo", "lat": "18.4861", "lon": "-69.9312"},
                {"display_name": "Otra Av. Duarte", "lat": "19.2", "lon": "-70.5"},
            ],
        )

    results = search_address("Av. Duarte 100, Santo Domingo", client=make_client(handler))

    assert len(results) == 2
    assert results[0].display_name == "Av. Duarte 100, Santo Domingo"
    assert results[0].lat == pytest.approx(18.4861)
    assert results[0].lng == pytest.approx(-69.9312)


def test_search_address_empty_results():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[])

    assert search_address("xyz inexistente", client=make_client(handler)) == []


def test_search_address_raises_geocoding_error_on_http_failure():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    with pytest.raises(GeocodingError):
        search_address("cualquier cosa", client=make_client(handler))
