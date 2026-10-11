import copy
from urllib.parse import parse_qs, urlparse

import numpy as np
import pytest
import responses

from trips.services.errors import ProviderQuotaExceeded, WeatherUnitsMismatch
from trips.services.weather import (
    URL,
    HourlySeries,
    OpenMeteoProvider,
    conditions_at,
    hourly_frames,
)

from .conftest import load_fixture

T0 = 1_791_727_200  # 2026-10-11 14:00 UTC, on the hour
HOUR = 3600


def make_series(wind, gust=None, rain=None, snow=None, start=T0):
    n = len(wind)
    as_array = lambda values: np.array(values if values is not None else [0.0] * n, dtype=float)  # noqa: E731
    return HourlySeries(
        times=start + HOUR * np.arange(n),
        wind=as_array(wind),
        gust=as_array(gust),
        rain=as_array(rain),
        snow=as_array(snow),
    )


SERIES = make_series(
    wind=[10, 20, 30], gust=[11, 22, 33], rain=[0.0, 0.3, 0.6], snow=[0.0, 0.1, 0.2]
)


def test_eta_between_hours_interpolates_wind_and_reads_the_hour_the_truck_is_in():
    c = conditions_at(SERIES, T0 + 20 * 60)  # 14:20
    assert c.wind_mph == pytest.approx(10 + 10 / 3)
    # The 15:00 slot covers 14:00 to 15:00.
    assert (c.gust_mph, c.rain_in_hr, c.snow_in_hr) == (22, 0.3, pytest.approx(0.1))


def test_eta_on_the_hour_reads_that_stamp_and_the_hour_that_starts_then():
    c = conditions_at(SERIES, T0 + HOUR)  # 15:00
    assert c.wind_mph == 20
    assert c.rain_in_hr == 0.6


def test_beyond_the_forecast_is_missing():
    c = conditions_at(SERIES, T0 + 3 * HOUR)
    assert (c.wind_mph, c.rain_in_hr, c.snow_in_hr) == (None, None, None)


def test_missing_neighbour_does_not_spoil_an_exact_hour():
    series = make_series(wind=[10, np.nan, 30])
    assert conditions_at(series, T0).wind_mph == 10
    assert conditions_at(series, T0 + 30 * 60).wind_mph is None


def test_heatmap_frames_read_exactly_like_checkpoints():
    other = make_series(wind=[5, 6, 7, 8], rain=[0.0, 0.1, 0.2, 0.3], start=T0 - HOUR)
    cells = [(1, 1), (2, 2), (3, 3)]
    frames = hourly_frames({(1, 1): SERIES, (2, 2): other}, cells, start_s=T0, hours=3)
    for h in range(3):
        for j, series in enumerate([SERIES, other, None]):
            c = conditions_at(series, T0 + h * HOUR)
            for name, value in (("wind", c.wind_mph), ("rain", c.rain_in_hr)):
                got = frames[name][h, j]
                assert (np.isnan(got) and value is None) or got == pytest.approx(value)


def test_provider_parses_several_locations_and_adds_showers_to_rain(http_mock):
    http_mock.add(responses.GET, URL, json=load_fixture("openmeteo_two_locations.json"))
    result = OpenMeteoProvider().series([(328, -968), (332, -971)])
    assert set(result) == {(328, -968), (332, -971)}
    raw = load_fixture("openmeteo_two_locations.json")[0]["hourly"]
    i = int(np.argmax(np.array(raw["showers"])))
    series = result[(328, -968)]
    assert len(series.times) == 264
    assert series.rain[i] == pytest.approx(raw["rain"][i] + raw["showers"][i], abs=1e-6)


def test_provider_accepts_a_single_location_object(http_mock):
    http_mock.add(responses.GET, URL, json=load_fixture("openmeteo_one_location.json"))
    assert list(OpenMeteoProvider().series([(328, -968)])) == [(328, -968)]


def test_provider_asks_for_mph_inches_and_unix_time(http_mock):
    http_mock.add(responses.GET, URL, json=load_fixture("openmeteo_two_locations.json"))
    OpenMeteoProvider().series([(328, -968), (332, -971)])
    query = parse_qs(urlparse(http_mock.calls[0].request.url).query)
    assert query["latitude"] == ["32.8,33.2"]
    assert query["longitude"] == ["-96.8,-97.1"]
    assert query["wind_speed_unit"] == ["mph"]
    assert query["precipitation_unit"] == ["inch"]
    assert query["timeformat"] == ["unixtime"]
    assert query["hourly"] == ["wind_speed_10m,wind_gusts_10m,rain,showers,snowfall"]


def test_cells_are_cached(http_mock):
    http_mock.add(responses.GET, URL, json=load_fixture("openmeteo_two_locations.json"))
    provider = OpenMeteoProvider()
    provider.series([(328, -968), (332, -971)])
    provider.series([(332, -971), (328, -968)])
    assert len(http_mock.calls) == 1


def test_unexpected_units_fail_loudly(http_mock):
    body = copy.deepcopy(load_fixture("openmeteo_one_location.json"))
    body["hourly_units"]["wind_speed_10m"] = "km/h"
    http_mock.add(responses.GET, URL, json=body)
    with pytest.raises(WeatherUnitsMismatch):
        OpenMeteoProvider().series([(328, -968)])


def test_repeated_429_is_reported_as_quota(http_mock):
    http_mock.add(responses.GET, URL, status=429)
    with pytest.raises(ProviderQuotaExceeded) as info:
        OpenMeteoProvider().series([(328, -968)])
    assert info.value.provider == "Open-Meteo"
    assert len(http_mock.calls) == 3


@pytest.mark.parametrize(
    ("reason", "says", "calls"),
    [
        (
            "Minutely API request limit exceeded. Please try again in one minute.",
            "per-minute limit",
            1,
        ),
        (
            "Hourly API request limit exceeded. Please try again in the next hour.",
            "hourly free quota",
            1,
        ),
        ("Daily API request limit exceeded. Please try again tomorrow.", "daily free quota", 1),
        # Whole words decide, not the first time unit mentioned.
        ("Daily API request limit exceeded. Try again in 24 hours.", "daily free quota", 1),
        ("Hourly limit exceeded, retry in 60 minutes.", "hourly free quota", 1),
        # An unnamed 429, such as a per-second limit, is worth retrying.
        ("Too many requests", "free quota is used up for now", 3),
    ],
)
def test_429_names_the_limit_and_retries_only_an_unnamed_one(http_mock, reason, says, calls):
    http_mock.add(responses.GET, URL, status=429, json={"error": True, "reason": reason})
    with pytest.raises(ProviderQuotaExceeded) as info:
        OpenMeteoProvider().series([(328, -968)])
    assert says in str(info.value)
    assert len(http_mock.calls) == calls
