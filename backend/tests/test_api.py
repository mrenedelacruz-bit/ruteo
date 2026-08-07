"""Pruebas de la API contra una base SQLite en memoria.

Cubren lo que realmente puede romper el flujo de campo: el dígito verificador
del NCF, el 404 vs 422 al escanear, y que una auditoría de presencia actualice
la fecha sin mover el pin salvo que se pida.

Ejecutar:  cd backend && pytest -q
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.db.session import get_session as dep_get_session
from app.main import app
from app.services.ncf import NCF_REGEX, NCFInvalidoError, generar_ncf, validar_ncf

API = "/api/v1"


@pytest.fixture(name="client")
def client_fixture():
    """Cliente con una base limpia en memoria por prueba."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,  # una sola conexión: si no, ':memory:' se vacía
    )
    SQLModel.metadata.create_all(engine)

    def _session_override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[dep_get_session] = _session_override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# --------------------------------------------------------------------------- #
# NCF                                                                         #
# --------------------------------------------------------------------------- #
def test_ncf_ida_y_vuelta():
    ncf = generar_ncf("MOB", 42)
    assert validar_ncf(ncf.lower()) == ncf  # tolera minúsculas del teclado iOS


def test_ncf_detecta_digito_alterado():
    ncf = generar_ncf("MOB", 42)
    alterado = ncf[:-1] + ("X" if ncf[-1] != "X" else "Y")
    with pytest.raises(NCFInvalidoError):
        validar_ncf(alterado)


def test_ncf_detecta_transposicion():
    """0042 vs 0024: una suma simple no lo notaría; la ponderada sí."""
    a, b = generar_ncf("MOB", 42), generar_ncf("MOB", 24)
    assert a[-1] != b[-1] or a[:-1] != b[:-1]
    with pytest.raises(NCFInvalidoError):
        validar_ncf(b[:-1] + a[-1])


# --------------------------------------------------------------------------- #
# Ciclo de vida de un bien                                                    #
# --------------------------------------------------------------------------- #
def test_alta_genera_ncf_y_url(client):
    r = client.post(
        f"{API}/bienes",
        json={"nombre": "Silla ergonómica", "categoria": "Mobiliario"},
    )
    assert r.status_code == 201, r.text
    cuerpo = r.json()
    assert NCF_REGEX.match(cuerpo["ncf"]), cuerpo["ncf"]
    assert validar_ncf(cuerpo["ncf"]) == cuerpo["ncf"]
    assert cuerpo["url_etiqueta"].endswith(f"/activo/{cuerpo['ncf']}")


def test_secuencia_no_colisiona(client):
    ncfs = {
        client.post(f"{API}/bienes", json={"nombre": f"Bien {i}", "categoria": "Mobiliario"})
        .json()["ncf"]
        for i in range(5)
    }
    assert len(ncfs) == 5


def test_ncf_mal_escrito_da_422_y_no_404(client):
    """En campo importa la diferencia: 422 = tecleaste mal, 404 = tag sin registrar."""
    assert client.get(f"{API}/bienes/HOLA-MUNDO").status_code == 422
    assert client.get(f"{API}/bienes/{generar_ncf('MOB', 999)}").status_code == 404


def test_auditoria_actualiza_fecha_sin_mover_el_pin(client):
    ncf = client.post(
        f"{API}/bienes",
        json={"nombre": "Proyector", "categoria": "Equipo de Oficina",
              "latitud": 18.47, "longitud": -69.93},
    ).json()["ncf"]

    r = client.post(
        f"{API}/bienes/{ncf}/auditorias",
        json={"latitud": 18.50, "longitud": -69.99, "usuario": "inspector",
              "sincronizar_ubicacion": False},
    )
    assert r.status_code == 201, r.text
    bien = r.json()["bien"]
    assert bien["fecha_ultima_lectura"] is not None
    assert bien["latitud"] == pytest.approx(18.47)  # el pin no se movió


def test_auditoria_con_sincronizacion_mueve_el_pin(client):
    ncf = client.post(
        f"{API}/bienes",
        json={"nombre": "Proyector", "categoria": "Equipo de Oficina",
              "latitud": 18.47, "longitud": -69.93},
    ).json()["ncf"]

    r = client.post(
        f"{API}/bienes/{ncf}/auditorias",
        json={"latitud": 18.50, "longitud": -69.99, "sincronizar_ubicacion": True},
    )
    assert r.json()["bien"]["latitud"] == pytest.approx(18.50)


def test_actualizar_ubicacion_y_bitacora(client):
    ncf = client.post(f"{API}/bienes", json={"nombre": "Impresora"}).json()["ncf"]

    r = client.put(
        f"{API}/bienes/{ncf}/ubicacion",
        json={"latitud": 18.48, "longitud": -69.94, "precision_gps_m": 12.5},
    )
    assert r.status_code == 200
    assert r.json()["longitud"] == pytest.approx(-69.94)

    eventos = client.get(f"{API}/bienes/{ncf}/auditorias").json()
    tipos = [e["tipo"] for e in eventos]
    assert "Alta" in tipos and "Actualización de ubicación" in tipos


def test_cambio_de_estado_queda_registrado(client):
    ncf = client.post(f"{API}/bienes", json={"nombre": "Nevera"}).json()["ncf"]
    client.patch(f"{API}/bienes/{ncf}", json={"estado": "En Reparación"})

    notas = [e["nota"] for e in client.get(f"{API}/bienes/{ncf}/auditorias").json()]
    assert any(n and "En Reparación" in n for n in notas)


def test_filtro_solo_geolocalizados(client):
    client.post(f"{API}/bienes", json={"nombre": "Sin GPS"})
    client.post(f"{API}/bienes", json={"nombre": "Con GPS", "latitud": 18.4, "longitud": -69.9})

    r = client.get(f"{API}/bienes", params={"solo_geolocalizados": True})
    assert [b["nombre"] for b in r.json()] == ["Con GPS"]


def test_preview_ncf_no_persiste(client):
    r = client.get(f"{API}/ncf/preview", params={"categoria": "Vehículo"})
    assert r.status_code == 200
    assert "-VEH-" in r.json()["ncf"]
    assert client.get(f"{API}/bienes").json() == []
