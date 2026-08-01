from datetime import date, datetime

from app.services.promise_date import compute_promised_date, local_date


def test_before_4pm_local_promises_next_day():
    # 19:30 UTC == 15:30 hora RD (UTC-4)
    result = compute_promised_date(datetime(2026, 7, 13, 19, 30))
    assert result == date(2026, 7, 14)


def test_at_4pm_local_promises_two_days_later():
    # 20:00 UTC == 16:00 hora RD, exactamente el corte
    result = compute_promised_date(datetime(2026, 7, 13, 20, 0))
    assert result == date(2026, 7, 15)


def test_after_4pm_local_promises_two_days_later():
    # 23:59 UTC == 19:59 hora RD
    result = compute_promised_date(datetime(2026, 7, 13, 23, 59))
    assert result == date(2026, 7, 15)


def test_just_before_4pm_local_promises_next_day():
    # 19:59 UTC == 15:59 hora RD
    result = compute_promised_date(datetime(2026, 7, 13, 19, 59))
    assert result == date(2026, 7, 14)


def test_local_date_can_differ_from_utc_date():
    # 02:00 UTC del dia 14 == 22:00 hora RD del dia 13 (un dia antes en UTC)
    assert local_date(datetime(2026, 7, 14, 2, 0)) == date(2026, 7, 13)
