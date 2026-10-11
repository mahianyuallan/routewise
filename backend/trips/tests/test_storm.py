import math

import pytest

from trips.services.geo import cell_of
from trips.services.risk import assess
from trips.services.sampling import Checkpoint
from trips.services.storm import (
    DRIFT_EAST_MPH,
    MILES_PER_DEGREE,
    PEAK_WIND_MPH,
    SimulatedStormProvider,
    Storm,
    storm_for,
)
from trips.services.weather import conditions_at

AT = 1_791_892_800  # 2026-10-13 12:00 UTC, on the hour
HOUR = 3600
STORM = Storm(lat=35.0, lon=-100.0, at_s=AT)
CENTRE = cell_of(35.0, -100.0)
RING = cell_of(35.4, -100.0)  # about 28 miles north: the High wind ring
FAR = cell_of(37.2, -100.0)  # about 152 miles north: beyond the storm


def at(cell, t=AT, load_lb=25_000):
    series = SimulatedStormProvider(STORM).series([cell])[cell]
    return assess(conditions_at(series, t), load_lb)


def test_wind_peaks_at_the_centre_and_is_calm_beyond_the_radius():
    centre = at(CENTRE)
    assert centre.wind_mph == pytest.approx(PEAK_WIND_MPH)
    assert 0.5 <= centre.rain_in_hr <= 0.8  # rain covers the hour, with the storm drifting on
    assert centre.snow_in_hr == 0
    assert at(FAR).wind_mph == 0
    assert at(FAR).rain_in_hr == 0


def test_rain_stops_well_inside_the_wind_radius():
    hundred_miles_north = cell_of(36.4, -100.0)
    weather = at(hundred_miles_north)
    assert 0 < weather.wind_mph < 25
    assert weather.rain_in_hr == 0


def test_the_storm_drifts_east_at_25_mph():
    lat, lon = STORM.centre_at(AT + 4 * HOUR)
    miles_per_degree_lon = MILES_PER_DEGREE * math.cos(math.radians(35.0))
    assert lat == 35.0
    assert float(lon) == pytest.approx(-100.0 + 4 * DRIFT_EAST_MPH / miles_per_degree_lon)
    assert float(STORM.centre_at(AT - HOUR)[1]) < -100.0


def test_load_rules_do_the_visible_work():
    assert at(CENTRE).level.key == "severe"
    heavy = at(CENTRE, load_lb=35_000)
    assert (heavy.level.key, heavy.load_rule) == ("no_travel", 2)

    assert at(RING).level.key == "high"
    heavier = at(RING, load_lb=45_000)
    assert (heavier.level.key, heavier.load_rule) == ("severe", 3)


def test_storm_sits_on_the_checkpoint_nearest_half_the_drive_time():
    checkpoints = [
        Checkpoint(
            index=i,
            mile=10 * i,
            lat=35 + 0.1 * i,
            lon=-100.123456,
            eta_s=1000 + 600 * i + 0.4,
            miles_covered=10,
            from_mile=10 * i - 5,
            to_mile=10 * i + 5,
        )
        for i in range(7)
    ]
    storm = storm_for(checkpoints)  # drive time 3600 s, so halfway is checkpoint 3
    assert storm == Storm(lat=35.3, lon=-100.12346, at_s=2800)


def test_series_are_hourly_and_the_same_for_the_same_storm():
    provider = SimulatedStormProvider(STORM)
    first = provider.series([CENTRE, RING])
    again = SimulatedStormProvider(Storm(35.0, -100.0, AT)).series([RING, CENTRE])
    assert set(first) == {CENTRE, RING}
    series = first[CENTRE]
    assert series.times[0] % HOUR == 0
    assert all(series.times[1:] - series.times[:-1] == HOUR)
    assert series.times[0] < AT - 2 * 24 * HOUR < AT + 3 * 24 * HOUR < series.times[-1]
    assert (again[CENTRE].wind == series.wind).all()
