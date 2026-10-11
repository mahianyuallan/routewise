"""Simulated weather: a labelled, deterministic storm that stands in for the forecast.

Switching a trip's `weather_source` to `simulated` swaps only the weather provider;
checkpoints, risk, ranking and the heatmap run unchanged. The storm sits on Route A's
checkpoint nearest the halfway point of its drive time, at that checkpoint's ETA, and
drifts east at 25 mph. Sustained wind peaks at 52 mph at the centre and fades linearly to
calm 150 miles out; rain peaks at 0.8 in/hr and stops 60 miles out, so the wind rings
(Severe core to 20 miles, High to 49, Moderate to 78) are not swamped by Severe rain.

Nothing reaches No Travel on weather alone, so the load rules do the visible work: above
30,000 lb the Severe core becomes No Travel (rule 2) and above 40,000 lb the High ring
becomes Severe (rule 3). Snow and the 55 mph rule are proven by the tests instead.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

from .geo import EARTH_RADIUS_M, METERS_PER_MILE, Cell, cell_center, haversine_m
from .sampling import Checkpoint
from .timeutil import iso_utc
from .weather import HOUR_S, HourlySeries

SIMULATED = "simulated"
PEAK_WIND_MPH = 52.0
PEAK_RAIN_IN_HR = 0.8
WIND_RADIUS_MILES = 150.0
RAIN_RADIUS_MILES = 60.0
DRIFT_EAST_MPH = 25.0
GUST_FACTOR = 1.3  # gusts are display-only
SERIES_SPAN_H = 7 * 24
"""Hourly stamps either side of the storm's time; far more than any trip or heatmap needs."""
MILES_PER_DEGREE = 2 * math.pi * EARTH_RADIUS_M / 360 / METERS_PER_MILE


@dataclass(frozen=True, slots=True)
class Storm:
    lat: float
    lon: float
    at_s: int
    """Unix seconds when the centre is at (lat, lon)."""

    def centre_at(self, t) -> tuple[np.ndarray, np.ndarray]:
        """(lat, lon) of the centre at Unix time(s) `t`; it drifts due east from `at_s`."""
        hours = (np.asarray(t, dtype=float) - self.at_s) / HOUR_S
        miles_per_degree_lon = MILES_PER_DEGREE * math.cos(math.radians(self.lat))
        lon = self.lon + hours * DRIFT_EAST_MPH / miles_per_degree_lon
        return np.full_like(lon, self.lat), lon

    def miles_from_centre(self, lat: float, lon: float, t) -> np.ndarray:
        centre_lat, centre_lon = self.centre_at(t)
        return haversine_m(lat, lon, centre_lat, centre_lon) / METERS_PER_MILE

    def as_dict(self) -> dict:
        """What the plan response carries; the heatmap call sends lat, lon and at_utc back."""
        return {
            "lat": self.lat,
            "lon": self.lon,
            "at_utc": iso_utc(self.at_s),
            "peak_wind_mph": PEAK_WIND_MPH,
            "peak_rain_in_hr": PEAK_RAIN_IN_HR,
            "wind_radius_miles": WIND_RADIUS_MILES,
            "rain_radius_miles": RAIN_RADIUS_MILES,
            "drift_east_mph": DRIFT_EAST_MPH,
        }


def storm_for(route_a: Sequence[Checkpoint]) -> Storm:
    """The storm centred on the checkpoint nearest halfway through the drive, at its ETA.

    Using a checkpoint rather than the exact halfway point means one checkpoint always sits
    in the core whatever the spacing. Coordinates are rounded exactly as the response
    rounds them, so the heatmap rebuilds the same storm from the echoed values.
    """
    half = (route_a[0].eta_s + route_a[-1].eta_s) / 2
    core = min(route_a, key=lambda c: abs(c.eta_s - half))
    return Storm(lat=round(core.lat, 5), lon=round(core.lon, 5), at_s=round(core.eta_s))


def _fade(miles: np.ndarray, radius_miles: float) -> np.ndarray:
    """1 at the centre, falling linearly to 0 at `radius_miles` and beyond."""
    return np.clip(1 - miles / radius_miles, 0.0, 1.0)


class SimulatedStormProvider:
    """A `WeatherProvider` whose hourly series come from the storm instead of Open-Meteo.

    Series follow Open-Meteo's conventions so `conditions_at` and `hourly_frames` read them
    unchanged: wind is the value at each stamp, while rain and gusts cover the hour before
    the stamp and are taken with the storm where it is halfway through that hour.
    """

    def __init__(self, storm: Storm) -> None:
        self.storm = storm

    def series(self, cells: Sequence[Cell]) -> dict[Cell, HourlySeries]:
        first = (self.storm.at_s // HOUR_S - SERIES_SPAN_H) * HOUR_S
        times = first + HOUR_S * np.arange(2 * SERIES_SPAN_H + 1)
        result = {}
        for cell in dict.fromkeys(cells):
            lat, lon = cell_center(cell)
            at_stamp = self.storm.miles_from_centre(lat, lon, times)
            mid_hour = self.storm.miles_from_centre(lat, lon, times - HOUR_S / 2)
            wind = PEAK_WIND_MPH * _fade(at_stamp, WIND_RADIUS_MILES)
            result[cell] = HourlySeries(
                times=times,
                wind=wind.astype(np.float32),
                gust=(PEAK_WIND_MPH * GUST_FACTOR * _fade(mid_hour, WIND_RADIUS_MILES)).astype(
                    np.float32
                ),
                rain=(PEAK_RAIN_IN_HR * _fade(mid_hour, RAIN_RADIUS_MILES)).astype(np.float32),
                snow=np.zeros(len(times), dtype=np.float32),
            )
        return result
