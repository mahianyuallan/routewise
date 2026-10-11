from datetime import UTC, datetime, timedelta

import pytest

from trips.services.departure import resolve_departure
from trips.services.errors import InvalidTrip

CHICAGO = "America/Chicago"


def test_local_time_becomes_utc():
    now = datetime(2026, 10, 11, 12, 0, tzinfo=UTC)
    result = resolve_departure(datetime(2026, 10, 12, 9, 0), CHICAGO, now)
    assert result == datetime(2026, 10, 12, 14, 0, tzinfo=UTC)  # CDT is UTC-5


def test_repeated_hour_when_clocks_go_back_takes_the_first_occurrence():
    now = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)
    result = resolve_departure(datetime(2026, 11, 1, 1, 30), CHICAGO, now)
    assert result == datetime(2026, 11, 1, 6, 30, tzinfo=UTC)  # 1:30 CDT, not 1:30 CST


def test_skipped_hour_when_clocks_go_forward_is_rejected():
    now = datetime(2027, 3, 10, 12, 0, tzinfo=UTC)
    with pytest.raises(InvalidTrip, match="doesn't exist"):
        resolve_departure(datetime(2027, 3, 14, 2, 30), CHICAGO, now)


def test_departure_in_the_past_is_rejected():
    now = datetime(2026, 10, 11, 15, 0, tzinfo=UTC)
    with pytest.raises(InvalidTrip, match="in the past"):
        resolve_departure(datetime(2026, 10, 11, 9, 0), CHICAGO, now)  # 14:00 UTC


def test_a_departure_a_few_minutes_ago_counts_as_now():
    now = datetime(2026, 10, 11, 15, 10, tzinfo=UTC)
    assert resolve_departure(datetime(2026, 10, 11, 10, 0), CHICAGO, now) == now


def test_more_than_seven_days_ahead_is_rejected():
    now = datetime(2026, 10, 11, 12, 0, tzinfo=UTC)
    local = (now + timedelta(days=7, hours=6)).replace(tzinfo=None)
    with pytest.raises(InvalidTrip, match="7 days"):
        resolve_departure(local, "UTC", now)


def test_unknown_time_zone():
    now = datetime(2026, 10, 11, 12, 0, tzinfo=UTC)
    with pytest.raises(InvalidTrip, match="time zone"):
        resolve_departure(datetime(2026, 10, 12, 9, 0), "Mars/Olympus", now)
