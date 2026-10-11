"""Hourly forecasts from Open-Meteo, cached per 0.1-degree cell and read at a truck's ETA.

Each cell's next 11 days are fetched once (still one call per location) and cached for an
hour, so trips with different departures share the cache. Hour alignment follows the API:
sustained wind is instantaneous at each stamp, while rain, showers, snowfall and gusts
cover the hour before their stamp.
"""

import logging
import math
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Protocol

import numpy as np
from django.core.cache import cache

from . import http
from .errors import ProviderUnavailable, WeatherUnitsMismatch
from .geo import Cell, cell_center
from .risk import Conditions

log = logging.getLogger(__name__)

PROVIDER = "Open-Meteo"
URL = "https://api.open-meteo.com/v1/forecast"
FORECAST_DAYS = 11
CHUNK_SIZE = 200
CACHE_SECONDS = 3600
TIMEOUT_S = 15
HOUR_S = 3600

VARIABLES = ("wind_speed_10m", "wind_gusts_10m", "rain", "showers", "snowfall")
EXPECTED_UNITS = {
    "wind_speed_10m": {"mp/h", "mph"},
    "wind_gusts_10m": {"mp/h", "mph"},
    "rain": {"inch"},
    "showers": {"inch"},
    "snowfall": {"inch"},
}


@dataclass(frozen=True, slots=True)
class HourlySeries:
    """One cell's hourly forecast on a regular hourly grid of Unix-second stamps."""

    times: np.ndarray
    wind: np.ndarray  # sustained mph at the stamp
    gust: np.ndarray  # strongest mph in the hour before the stamp
    rain: np.ndarray  # rain + showers, inches in the hour before the stamp
    snow: np.ndarray  # snowfall, inches in the hour before the stamp


class WeatherProvider(Protocol):
    def series(self, cells: Sequence[Cell]) -> dict[Cell, HourlySeries]: ...


def _value(x: float) -> float | None:
    x = float(x)
    return None if math.isnan(x) else x


def conditions_at(series: HourlySeries | None, t: float) -> Conditions:
    """Weather when the truck is there at Unix time `t`.

    Sustained wind is interpolated between the two surrounding stamps. Rain, snow and gusts
    come from the hour the truck is in: for 14:20 that is the 15:00 value (14:00 to 15:00).
    """
    if series is None:
        return Conditions(None, None, None, None)
    t0, n = float(series.times[0]), len(series.times)

    wind = None
    pos = (t - t0) / HOUR_S
    if 0 <= pos <= n - 1:
        i0 = math.floor(pos)
        frac = pos - i0
        if frac == 0:
            wind = _value(series.wind[i0])
        else:
            wind = _value(series.wind[i0] * (1 - frac) + series.wind[i0 + 1] * frac)

    slot = math.floor((t - t0) / HOUR_S) + 1
    if 0 <= slot < n:
        return Conditions(
            wind, _value(series.gust[slot]), _value(series.rain[slot]), _value(series.snow[slot])
        )
    return Conditions(wind, None, None, None)


def hourly_frames(
    series_by_cell: dict[Cell, HourlySeries], cells: Sequence[Cell], start_s: int, hours: int
) -> dict[str, np.ndarray]:
    """Arrays of shape (hours, cells) for the heatmap, read exactly like `conditions_at`.

    `start_s` is on the hour, so every frame falls on a stamp: wind is the stamp's value,
    and rain, snow and gusts come from the next stamp (the hour starting at the frame).
    """
    shape = (hours, len(cells))
    frames = {name: np.full(shape, np.nan) for name in ("wind", "gust", "rain", "snow")}
    steps = np.arange(hours)
    for j, cell in enumerate(cells):
        series = series_by_cell.get(cell)
        if series is None:
            continue
        n = len(series.times)
        offset, remainder = divmod(start_s - int(series.times[0]), HOUR_S)
        if remainder:
            raise ValueError("Heatmap frames must start on the hour.")
        at = offset + steps
        ok = (at >= 0) & (at < n)
        frames["wind"][ok, j] = series.wind[at[ok]]
        slot = at + 1
        ok = (slot >= 0) & (slot < n)
        frames["gust"][ok, j] = series.gust[slot[ok]]
        frames["rain"][ok, j] = series.rain[slot[ok]]
        frames["snow"][ok, j] = series.snow[slot[ok]]
    return frames


class OpenMeteoProvider:
    """Fetches and caches cell forecasts from the free Open-Meteo API."""

    def series(self, cells: Sequence[Cell]) -> dict[Cell, HourlySeries]:
        unique = list(dict.fromkeys(cells))
        keys = {cell: f"wx:v1:{cell[0]}:{cell[1]}" for cell in unique}
        cached = cache.get_many(list(keys.values()))
        result = {cell: cached[keys[cell]] for cell in unique if keys[cell] in cached}
        missing = [cell for cell in unique if cell not in result]
        if missing:
            chunks = [missing[i : i + CHUNK_SIZE] for i in range(0, len(missing), CHUNK_SIZE)]
            with ThreadPoolExecutor(max_workers=min(4, len(chunks))) as pool:
                for fetched in pool.map(_fetch_chunk, chunks):
                    result.update(fetched)
            cache.set_many({keys[c]: result[c] for c in missing if c in result}, CACHE_SECONDS)
        log.info(
            "weather cells: %d requested, %d cached, %d fetched",
            len(unique),
            len(unique) - len(missing),
            len(missing),
        )
        return result


def _fetch_chunk(cells: Sequence[Cell]) -> dict[Cell, HourlySeries]:
    centers = [cell_center(cell) for cell in cells]
    params = {
        "latitude": ",".join(f"{lat:.1f}" for lat, _ in centers),
        "longitude": ",".join(f"{lon:.1f}" for _, lon in centers),
        "hourly": ",".join(VARIABLES),
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timeformat": "unixtime",
        "timezone": "GMT",
        "forecast_days": FORECAST_DAYS,
    }
    response = http.get(PROVIDER, URL, params, timeout=TIMEOUT_S)
    if response.status_code != 200:
        log.error("Open-Meteo %s: %s", response.status_code, response.text[:300])
        raise ProviderUnavailable(PROVIDER, "The weather service rejected the request.")
    body = response.json()
    locations = body if isinstance(body, list) else [body]
    if len(locations) != len(cells):
        raise ProviderUnavailable(
            PROVIDER, "The weather service returned the wrong number of places."
        )
    return {cell: parse_location(location) for cell, location in zip(cells, locations, strict=True)}


def parse_location(location: dict[str, Any]) -> HourlySeries:
    units = location.get("hourly_units", {})
    for variable, allowed in EXPECTED_UNITS.items():
        if units.get(variable) not in allowed:
            raise WeatherUnitsMismatch(
                PROVIDER, f"{variable} came back in {units.get(variable)!r}, not mph or inches."
            )
    hourly = location["hourly"]
    times = np.asarray(hourly["time"], dtype=np.int64)
    if len(times) < 2 or np.any(np.diff(times) != HOUR_S):
        raise ProviderUnavailable(
            PROVIDER, "The weather service returned an irregular time series."
        )

    def column(name: str) -> np.ndarray:
        return np.asarray(hourly[name], dtype=float)

    return HourlySeries(
        times=times,
        wind=column("wind_speed_10m").astype(np.float32),
        gust=column("wind_gusts_10m").astype(np.float32),
        rain=(column("rain") + column("showers")).astype(np.float32),
        snow=column("snowfall").astype(np.float32),
    )
