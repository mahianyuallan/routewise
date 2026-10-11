"""Turn the driver's wall-clock departure at the origin into a UTC instant."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .errors import InvalidTrip

GRACE = timedelta(minutes=15)
"""A departure up to this far in the past counts as leaving now."""
MAX_AHEAD = timedelta(days=7)
"""Keeps the whole trip and the 48-hour heatmap inside the 16-day forecast."""


def resolve_departure(local: datetime, tz_name: str, now: datetime) -> datetime:
    """UTC departure for a naive local time in the origin's time zone.

    A time that happens twice when the clocks go back takes its first occurrence; a time
    that doesn't exist when they go forward is rejected, as are departures before now.
    """
    if local.tzinfo is not None:
        raise ValueError("Expected a naive local time.")
    try:
        tz = ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise InvalidTrip(f"Unknown time zone {tz_name!r}.") from exc

    aware = local.replace(tzinfo=tz, fold=0)
    if aware.astimezone(UTC).astimezone(tz).replace(tzinfo=None) != local:
        raise InvalidTrip(
            f"{local:%H:%M on %a %d %b} doesn't exist in {tz_name}: the clocks go forward "
            "then. Pick another time."
        )
    departure = aware.astimezone(UTC)
    if departure < now - GRACE:
        raise InvalidTrip("That departure is in the past. Pick a time from now on.")
    if departure > now + MAX_AHEAD:
        raise InvalidTrip("Pick a departure within the next 7 days.")
    return max(departure, now)
