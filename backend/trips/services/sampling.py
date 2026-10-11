"""Checkpoints along a route: where they sit, when the truck gets there, what road they cover."""

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

import numpy as np

from .geo import METERS_PER_MILE, cell_of, cumulative_m

SPACING_OPTIONS = (10, 25, 50)
DEFAULT_SPACING = 25
CHECKPOINT_CELL_BUDGET = 300
"""At most this many distinct weather cells for one plan's checkpoints (all routes together)."""

_EPS_MI = 1e-6


@dataclass(frozen=True, slots=True)
class RouteProfile:
    """A route's vertices with the routing provider's distance and travel time at each one."""

    lats: np.ndarray
    lons: np.ndarray
    dist_m: np.ndarray
    time_s: np.ndarray

    @property
    def length_m(self) -> float:
        return float(self.dist_m[-1])

    @property
    def length_mi(self) -> float:
        return self.length_m / METERS_PER_MILE

    @property
    def travel_time_s(self) -> float:
        return float(self.time_s[-1])


def build_profile(
    points: Sequence[tuple[float, float]],
    progress: Sequence[Mapping[str, float]],
    length_m: float,
    travel_time_s: float,
) -> RouteProfile:
    """Map every vertex onto TomTom's distance and travel-time scales.

    TomTom's `progress` lists distance and time for some vertices; values in between are
    interpolated by Haversine distance between the leg points, as TomTom documents.
    """
    lats = np.array([p[0] for p in points], dtype=float)
    lons = np.array([p[1] for p in points], dtype=float)
    haversine = cumulative_m(lats, lons)
    entries = list(progress) or [
        {"pointIndex": 0, "distanceInMeters": 0, "travelTimeInSeconds": 0},
        {
            "pointIndex": len(points) - 1,
            "distanceInMeters": length_m,
            "travelTimeInSeconds": travel_time_s,
        },
    ]
    idx = np.array([e["pointIndex"] for e in entries], dtype=int)
    known_h = haversine[idx]
    keep = np.concatenate(([True], np.diff(known_h) > 0))
    known_h = known_h[keep]
    known_d = np.array([e["distanceInMeters"] for e in entries], dtype=float)[keep]
    known_t = np.array([e["travelTimeInSeconds"] for e in entries], dtype=float)[keep]
    return RouteProfile(
        lats=lats,
        lons=lons,
        dist_m=np.interp(haversine, known_h, known_d),
        time_s=np.interp(haversine, known_h, known_t),
    )


def checkpoint_miles(length_mi: float, spacing_mi: int) -> np.ndarray:
    """Mile 0, N, 2N, ... plus the destination when the length isn't a multiple of N."""
    if length_mi <= _EPS_MI:
        return np.array([0.0])
    count = math.floor((length_mi - _EPS_MI) / spacing_mi) + 1
    return np.append(np.arange(count) * float(spacing_mi), length_mi)


def miles_covered(positions_mi: np.ndarray) -> np.ndarray:
    """Each checkpoint stands for the road halfway to its neighbours; the total is the length."""
    covered = np.zeros(len(positions_mi))
    if len(positions_mi) < 2:
        return covered
    half_gaps = np.diff(positions_mi) / 2
    covered[:-1] += half_gaps
    covered[1:] += half_gaps
    return covered


@dataclass(frozen=True, slots=True)
class Checkpoint:
    index: int
    mile: float
    lat: float
    lon: float
    eta_s: float
    """Unix seconds, UTC."""
    miles_covered: float
    from_mile: float
    to_mile: float


def place_checkpoints(
    profile: RouteProfile, spacing_mi: int, departure_s: float
) -> list[Checkpoint]:
    """Checkpoints with positions and ETAs interpolated from the route's own profile."""
    positions = checkpoint_miles(profile.length_mi, spacing_mi)
    at_m = positions * METERS_PER_MILE
    lats = np.interp(at_m, profile.dist_m, profile.lats)
    lons = np.interp(at_m, profile.dist_m, profile.lons)
    times = np.interp(at_m, profile.dist_m, profile.time_s)
    covered = miles_covered(positions)
    midpoints = (positions[:-1] + positions[1:]) / 2
    starts = np.concatenate(([0.0], midpoints))
    ends = np.concatenate((midpoints, [positions[-1]]))
    return [
        Checkpoint(
            index=i,
            mile=float(positions[i]),
            lat=float(lats[i]),
            lon=float(lons[i]),
            eta_s=departure_s + float(times[i]),
            miles_covered=float(covered[i]),
            from_mile=float(starts[i]),
            to_mile=float(ends[i]),
        )
        for i in range(len(positions))
    ]


def checkpoint_cells(profiles: Sequence[RouteProfile], spacing_mi: int) -> set:
    cells = set()
    for profile in profiles:
        at_m = checkpoint_miles(profile.length_mi, spacing_mi) * METERS_PER_MILE
        lats = np.interp(at_m, profile.dist_m, profile.lats)
        lons = np.interp(at_m, profile.dist_m, profile.lons)
        cells.update(cell_of(lat, lon) for lat, lon in zip(lats, lons, strict=True))
    return cells


def choose_spacing(profiles: Sequence[RouteProfile], requested_mi: int) -> int:
    """The requested spacing, or the next wider one if the weather budget would be exceeded."""
    for spacing in (s for s in SPACING_OPTIONS if s >= requested_mi):
        if len(checkpoint_cells(profiles, spacing)) <= CHECKPOINT_CELL_BUDGET:
            return spacing
    return SPACING_OPTIONS[-1]
