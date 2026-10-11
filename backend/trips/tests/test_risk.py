import numpy as np
import pytest

from trips.services.risk import (
    NO_DATA,
    Conditions,
    RiskLevel,
    assess,
    classify,
)

L, M, H, S, NT = (
    RiskLevel.LOW,
    RiskLevel.MODERATE,
    RiskLevel.HIGH,
    RiskLevel.SEVERE,
    RiskLevel.NO_TRAVEL,
)


def level_of(wind=0.0, rain=0.0, snow=0.0, load=0):
    return assess(Conditions(wind, None, rain, snow), load).level


@pytest.mark.parametrize(
    ("wind", "expected"),
    [
        (0, L),
        (24.9, L),
        (25.0, M),
        (34.9, M),
        (35.0, H),
        (44.9, H),
        (45.0, S),
        (54.9, S),
        (55.0, NT),
        (80.0, NT),
    ],
)
def test_wind_boundaries_with_light_load(wind, expected):
    assert level_of(wind=wind) is expected


@pytest.mark.parametrize(
    ("rain", "expected"),
    [(0.09, L), (0.10, M), (0.24, M), (0.25, H), (0.49, H), (0.50, S), (1.00, S), (1.01, NT)],
)
def test_rain_boundaries(rain, expected):
    assert level_of(rain=rain) is expected


@pytest.mark.parametrize(
    ("snow", "expected"),
    [(0.4, L), (0.5, M), (0.9, M), (1.0, H), (1.9, H), (2.0, S), (3.0, S), (3.1, NT)],
)
def test_snow_boundaries(snow, expected):
    assert level_of(snow=snow) is expected


@pytest.mark.parametrize(
    ("wind", "load", "expected", "rule"),
    [
        (55.0, 1_000, NT, 1),  # rule 1: 55 mph or more is No Travel for any load
        (45.0, 30_000, S, None),  # rule 2 needs strictly more than 30,000 lb
        (45.0, 30_001, NT, 2),
        (50.0, 30_000, S, None),
        (50.0, 30_001, NT, 2),
        (54.9, 45_000, NT, 2),
        (35.0, 40_000, H, None),  # rule 3 needs strictly more than 40,000 lb
        (35.0, 40_001, S, 3),
        (40.0, 40_000, H, None),
        (40.0, 40_001, S, 3),
        (44.9, 45_000, S, 3),
        (34.9, 45_000, M, None),  # load rules never touch Moderate or Low
        (24.9, 45_000, L, None),
    ],
)
def test_load_rules(wind, load, expected, rule):
    result = assess(Conditions(wind, None, 0.0, 0.0), load)
    assert result.level is expected
    assert result.load_rule == rule


def test_load_rule_3_does_not_escalate_to_no_travel():
    # 40 mph with 45,000 lb is above both thresholds, but rule 3 makes it Severe, not No Travel.
    assert level_of(wind=40.0, load=45_000) is S


def test_checkpoint_level_is_the_worst_condition():
    result = assess(Conditions(30.0, 41.0, 0.30, 0.0), 10_000)
    assert (result.wind, result.rain, result.snow) == (M, H, L)
    assert result.level is H
    assert result.reason == "High: 0.30 in/hr rain"


def test_reason_names_every_condition_at_the_top_level():
    result = assess(Conditions(47.0, None, 0.60, 2.5), 10_000)
    assert result.level is S
    assert result.reason == "Severe: 47.0 mph wind and 0.60 in/hr rain and 2.50 in/hr snow"


def test_reason_names_the_load_rule():
    result = assess(Conditions(38.0, None, 0.0, 0.0), 42_000)
    assert result.reason == "Severe: 38.0 mph wind with a 42,000 lb load (load rule 3)"


def test_low_reason():
    assert assess(Conditions(5.0, 9.0, 0.0, 0.0), 0).reason.startswith("Low:")


def test_rain_plus_showers_rounding_does_not_fall_below_a_threshold():
    # 0.06 + 0.04 is 0.09999999999999999 in floating point; it must still be Moderate.
    result = assess(Conditions(0.0, None, 0.06 + 0.04, 0.0), 0)
    assert result.rain_in_hr == 0.10
    assert result.level is M


def test_classified_value_matches_the_displayed_value():
    # 24.96 mph shows as 25.0 mph, so it is classified as 25.0: Moderate.
    result = assess(Conditions(24.96, None, 0.0, 0.0), 0)
    assert result.wind_mph == 25.0
    assert result.level is M


@pytest.mark.parametrize("missing", ["wind_mph", "rain_in_hr", "snow_in_hr"])
def test_missing_value_is_no_data_never_low(missing):
    values = {"wind_mph": 5.0, "gust_mph": None, "rain_in_hr": 0.0, "snow_in_hr": 0.0}
    values[missing] = None
    result = assess(Conditions(**values), 0)
    assert result.level is None
    assert result.reason.startswith("No data")


def test_missing_gust_does_not_block_classification():
    assert assess(Conditions(30.0, None, 0.0, 0.0), 0).level is M


def test_array_and_scalar_paths_agree():
    rng = np.random.default_rng(7)
    wind = rng.uniform(0, 70, 400).round(2)
    rain = rng.uniform(0, 1.3, 400).round(3)
    snow = rng.uniform(0, 3.5, 400).round(3)
    for load in (0, 30_000, 30_001, 40_001, 45_000):
        arrays = classify(wind, rain, snow, load)
        for i in range(0, 400, 7):
            scalar = assess(Conditions(wind[i], None, rain[i], snow[i]), load).level
            assert arrays.level[i] == int(scalar)


def test_array_path_marks_missing_as_no_data():
    arrays = classify([10.0, np.nan], [0.0, 0.0], [0.0, 0.0], 0)
    assert arrays.level.tolist() == [0, NO_DATA]
