from datetime import UTC, datetime


def iso_utc(seconds: float) -> str:
    """Unix seconds as an ISO 8601 UTC string, to the second, e.g. 2026-10-12T14:00:00Z."""
    return datetime.fromtimestamp(round(seconds), UTC).isoformat().replace("+00:00", "Z")
