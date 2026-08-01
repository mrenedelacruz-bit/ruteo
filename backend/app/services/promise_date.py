"""Calculo de la fecha de promesa de entrega de un pedido.

Regla de negocio: un pedido colocado antes de las 4:00pm (hora de Republica
Dominicana) promete entrega al dia siguiente; colocado a las 4:00pm o
despues, promete entrega dos dias despues (un dia extra de margen porque
ya no alcanza a prepararse para el dia siguiente). La entrega real queda
sujeta a que se complete la carga de un camion (ver services.assignment) —
esto es una fecha objetivo, no una garantia.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

COMPANY_TZ = ZoneInfo("America/Santo_Domingo")
CUTOFF_HOUR = 16  # 4:00pm


def _to_local(dt_utc: datetime) -> datetime:
    """`dt_utc` debe ser un datetime en UTC (naive o aware)."""
    if dt_utc.tzinfo is None:
        dt_utc = dt_utc.replace(tzinfo=ZoneInfo("UTC"))
    return dt_utc.astimezone(COMPANY_TZ)


def local_date(dt_utc: datetime) -> date:
    """Dia calendario en Republica Dominicana en que ocurrio `dt_utc`."""
    return _to_local(dt_utc).date()


def compute_promised_date(created_at_utc: datetime) -> date:
    local = _to_local(created_at_utc)
    days_ahead = 1 if local.hour < CUTOFF_HOUR else 2
    return (local + timedelta(days=days_ahead)).date()
