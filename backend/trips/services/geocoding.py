"""Place search through Geoapify Address Autocomplete, US only, cached for a day."""

import re
from functools import lru_cache

from django.conf import settings
from django.core.cache import cache
from timezonefinder import TimezoneFinder

from . import http
from .errors import ProviderRejected, ProviderUnavailable

PROVIDER = "Geoapify"
URL = "https://api.geoapify.com/v1/geocode/autocomplete"
TIMEOUT_S = 5
CACHE_SECONDS = 24 * 3600
LIMIT = 5


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def search_places(text: str) -> list[dict]:
    """Up to five US places, each with coordinates and an IANA time zone."""
    query = normalize(text)
    key = f"places:v1:{query}"
    cached = cache.get(key)
    if cached is not None:
        return cached
    params = {
        "text": query,
        "filter": "countrycode:us",
        "limit": LIMIT,
        "format": "json",
        "apiKey": settings.GEOAPIFY_API_KEY,
    }
    response = http.get(PROVIDER, URL, params, timeout=TIMEOUT_S)
    if response.status_code in (401, 403):
        raise ProviderRejected(PROVIDER, "Geoapify rejected the API key.")
    if response.status_code != 200:
        raise ProviderUnavailable(PROVIDER, "Place search isn't available right now.")
    places = []
    for result in response.json().get("results", []):
        lat, lon = result.get("lat"), result.get("lon")
        if lat is None or lon is None:
            continue
        timezone = (result.get("timezone") or {}).get("name") or timezone_for(lat, lon)
        places.append(
            {
                "label": result.get("formatted") or f"{lat:.4f}, {lon:.4f}",
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "timezone": timezone,
            }
        )
    cache.set(key, places, CACHE_SECONDS)
    return places


@lru_cache(maxsize=1)
def _finder() -> TimezoneFinder:
    return TimezoneFinder()


def timezone_for(lat: float, lon: float) -> str | None:
    """IANA time zone from coordinates, for places that arrive without one."""
    return _finder().timezone_at(lng=lon, lat=lat)
