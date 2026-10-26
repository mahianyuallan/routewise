"""The RouteWise risk and load rules, as pure functions.

Ranges are half-open, so every value lands in exactly one level and a value on a
shared edge takes the higher level (35 mph is High). The spec's strict ">1.00" for
rain and ">3.0" for snow keep exactly 1.00 and 3.0 at Severe.

Values are rounded to the precision the UI shows (0.1 mph, 0.01 in/hr) before they
are classified, so a level always matches the number on screen. Checkpoints and the
heatmap share the array implementation below, so they can never disagree.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass
from enum import IntEnum

import numpy as np


class RiskLevel(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def label(self) -> str:
        return "No Travel" if self is RiskLevel.NO_TRAVEL else self.name.title()

    @property
    def key(self) -> str:
        return self.name.lower()


NO_DATA = -1
"""Array value for a point whose forecast is missing ("No data", never Low)."""

# Lower bounds of Moderate, High, Severe and No Travel.
WIND_MPH = (25.0, 35.0, 45.0, 55.0)  # No Travel at 55 mph or more
RAIN_IN_HR = (0.10, 0.25, 0.50, 1.00)  # No Travel above 1.00 in/hr
SNOW_IN_HR = (0.5, 1.0, 2.0, 3.0)  # No Travel above 3.0 in/hr

LOAD_RULE_2_LB = 30_000  # 45 to under 55 mph with a load above this: No Travel
LOAD_RULE_3_LB = 40_000  # 35 to under 45 mph with a load above this: Severe
MAX_LOAD_LB = 45_000

WIND_DECIMALS = 1
PRECIP_DECIMALS = 2


def round_wind(mph) -> np.ndarray:
    return np.round(np.asarray(mph, dtype=float), WIND_DECIMALS)


def round_precip(in_hr) -> np.ndarray:
    return np.round(np.asarray(in_hr, dtype=float), PRECIP_DECIMALS)


def wind_levels(wind_mph) -> np.ndarray:
    """Wind level before the load rules."""
    w = np.asarray(wind_mph, dtype=float)
    b = WIND_MPH
    return np.select([w < b[0], w < b[1], w < b[2], w < b[3]], [0, 1, 2, 3], default=4)


def precip_levels(in_hr, bounds: tuple[float, float, float, float]) -> np.ndarray:
    """Rain or snow level. Severe includes its upper bound; No Travel is strictly above."""
    x = np.asarray(in_hr, dtype=float)
    return np.select([x < bounds[0], x < bounds[1], x < bounds[2], x <= bounds[3]], [0, 1, 2, 3], 4)


def apply_load_rules(levels: np.ndarray, load_lb: int) -> tuple[np.ndarray, np.ndarray]:
    """The brief's three load rules. Returns (wind levels, rule that fired or 0)."""
    base = np.asarray(levels)
    adjusted = base.copy()
    rule = np.where(base == RiskLevel.NO_TRAVEL, 1, 0)
    if load_lb > LOAD_RULE_2_LB:
        hit = base == RiskLevel.SEVERE
        adjusted[hit] = RiskLevel.NO_TRAVEL
        rule[hit] = 2
    if load_lb > LOAD_RULE_3_LB:
        hit = base == RiskLevel.HIGH
        adjusted[hit] = RiskLevel.SEVERE
        rule[hit] = 3
    return adjusted, rule


@dataclass(frozen=True, slots=True)
class LevelArrays:
    """Classification of many points at once. Levels use NO_DATA (-1) where data is missing."""

    level: np.ndarray
    wind: np.ndarray
    rain: np.ndarray
    snow: np.ndarray
    load_rule: np.ndarray
    wind_mph: np.ndarray
    rain_in_hr: np.ndarray
    snow_in_hr: np.ndarray


def classify(wind_mph, rain_in_hr, snow_in_hr, load_lb: int) -> LevelArrays:
    """Classify arrays of sustained wind, rain (rain + showers) and snow for one load."""
    w, r, s = round_wind(wind_mph), round_precip(rain_in_hr), round_precip(snow_in_hr)
    w_missing, r_missing, s_missing = np.isnan(w), np.isnan(r), np.isnan(s)
    wind, rule = apply_load_rules(wind_levels(w), load_lb)
    rain = precip_levels(r, RAIN_IN_HR)
    snow = precip_levels(s, SNOW_IN_HR)
    missing = w_missing | r_missing | s_missing
    level = np.where(missing, NO_DATA, np.maximum(np.maximum(wind, rain), snow))
    return LevelArrays(
        level=level,
        wind=np.where(w_missing, NO_DATA, wind),
        rain=np.where(r_missing, NO_DATA, rain),
        snow=np.where(s_missing, NO_DATA, snow),
        load_rule=np.where(w_missing, 0, rule),
        wind_mph=w,
        rain_in_hr=r,
        snow_in_hr=s,
    )


@dataclass(frozen=True, slots=True)
class Conditions:
    """Weather at one place and time. Rain is rain plus showers; gusts are display-only."""

    wind_mph: float | None
    gust_mph: float | None
    rain_in_hr: float | None
    snow_in_hr: float | None


@dataclass(frozen=True, slots=True)
class Assessment:
    """A checkpoint's risk. `level` is None when the forecast is missing (No data)."""

    level: RiskLevel | None
    wind: RiskLevel | None
    rain: RiskLevel | None
    snow: RiskLevel | None
    load_rule: int | None
    reason: str
    wind_mph: float | None
    gust_mph: float | None
    rain_in_hr: float | None
    snow_in_hr: float | None


def _nan_if_none(value: float | None) -> float:
    return math.nan if value is None else float(value)


def _level_or_none(value: int) -> RiskLevel | None:
    return None if value == NO_DATA else RiskLevel(int(value))


def _number_or_none(value: float) -> float | None:
    return None if math.isnan(value) else float(value)


def assess(conditions: Conditions, load_lb: int) -> Assessment:
    """Risk level, per-condition levels and a plain-language reason for one checkpoint."""
    return assess_many([conditions], load_lb)[0]


def assess_many(conditions: Sequence[Conditions], load_lb: int) -> list[Assessment]:
    """`assess` for many checkpoints at once, classified in a single array pass."""
    arrays = classify(
        [_nan_if_none(c.wind_mph) for c in conditions],
        [_nan_if_none(c.rain_in_hr) for c in conditions],
        [_nan_if_none(c.snow_in_hr) for c in conditions],
        load_lb,
    )
    gusts = round_wind([_nan_if_none(c.gust_mph) for c in conditions])
    return [_assessment(arrays, i, gusts[i], load_lb) for i in range(len(conditions))]


def _assessment(arrays: LevelArrays, i: int, gust: float, load_lb: int) -> Assessment:
    wind_mph = _number_or_none(arrays.wind_mph[i])
    rain = _number_or_none(arrays.rain_in_hr[i])
    snow = _number_or_none(arrays.snow_in_hr[i])
    level = _level_or_none(arrays.level[i])
    wind_level = _level_or_none(arrays.wind[i])
    rain_level = _level_or_none(arrays.rain[i])
    snow_level = _level_or_none(arrays.snow[i])
    load_rule = int(arrays.load_rule[i]) or None

    if level is None:
        missing = [
            name
            for name, value in (("wind", wind_mph), ("rain", rain), ("snow", snow))
            if value is None
        ]
        reason = f"No data: the forecast is missing {' and '.join(missing)}"
    else:
        reason = _reason(
            level, wind_mph, wind_level, load_rule, rain, rain_level, snow, snow_level, load_lb
        )
    return Assessment(
        level,
        wind_level,
        rain_level,
        snow_level,
        load_rule,
        reason,
        wind_mph,
        _number_or_none(gust),
        rain,
        snow,
    )


def _reason(
    level, wind_mph, wind_level, load_rule, rain, rain_level, snow, snow_level, load_lb
) -> str:
    if level is RiskLevel.LOW:
        return "Low: wind, rain and snow are all below Moderate"
    drivers = []
    if wind_level == level:
        if load_rule in (2, 3):
            drivers.append(
                f"{wind_mph:.1f} mph wind with a {load_lb:,} lb load (load rule {load_rule})"
            )
        elif load_rule == 1:
            drivers.append(f"{wind_mph:.1f} mph wind (load rule 1)")
        else:
            drivers.append(f"{wind_mph:.1f} mph wind")
    if rain_level == level:
        drivers.append(f"{rain:.2f} in/hr rain")
    if snow_level == level:
        drivers.append(f"{snow:.2f} in/hr snow")
    return f"{level.label}: {' and '.join(drivers)}"
