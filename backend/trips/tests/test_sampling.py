import numpy as np
import pytest

from trips.services.geo import METERS_PER_MILE, cumulative_m
from trips.services.sampling import (
    CHECKPOINT_CELL_BUDGET,
    build_profile,
    checkpoint_cells,
    checkpoint_miles,
    choose_spacing,
    miles_covered,
    place_checkpoints,
)


def straight_route(miles: float, n_points: int = 400, mph: float = 60.0, lat: float = 35.0):
    """A due-east route at constant speed, with progress at the ends only."""
    lon_per_mile = 1 / (69.172 * np.cos(np.radians(lat)))
    lons = -100 + np.linspace(0, miles * lon_per_mile, n_points)
    points = [(lat, lon) for lon in lons]
    length_m = float(cumulative_m(np.full(n_points, lat), lons)[-1])
    time_s = length_m / METERS_PER_MILE / mph * 3600
    progress = [
        {"pointIndex": 0, "distanceInMeters": 0, "travelTimeInSeconds": 0},
        {"pointIndex": n_points - 1, "distanceInMeters": length_m, "travelTimeInSeconds": time_s},
    ]
    return build_profile(points, progress, length_m, time_s)


def test_positions_include_origin_and_destination():
    assert checkpoint_miles(60.0, 25).tolist() == [0, 25, 50, 60]


def test_exact_multiple_does_not_duplicate_destination():
    assert checkpoint_miles(50.0, 25).tolist() == [0, 25, 50]


def test_route_shorter_than_spacing():
    assert checkpoint_miles(8.0, 25).tolist() == [0, 8]


def test_zero_length_route():
    assert checkpoint_miles(0.0, 25).tolist() == [0]


def test_miles_covered_sum_to_length_and_weight_the_short_last_gap():
    positions = checkpoint_miles(60.0, 25)
    covered = miles_covered(positions)
    assert covered.tolist() == [12.5, 25.0, 17.5, 5.0]
    assert covered.sum() == pytest.approx(60.0)


@pytest.mark.parametrize("spacing", [10, 25, 50])
def test_checkpoints_follow_spacing_and_etas_increase(spacing):
    profile = straight_route(183.0)
    cps = place_checkpoints(profile, spacing, departure_s=1_800_000_000)
    miles = [c.mile for c in cps]
    assert miles[0] == 0
    assert miles[-1] == pytest.approx(profile.length_mi)
    assert np.allclose(np.diff(miles[:-1]), spacing)
    etas = [c.eta_s for c in cps]
    assert etas[0] == 1_800_000_000
    assert all(b > a for a, b in zip(etas, etas[1:], strict=False))
    assert sum(c.miles_covered for c in cps) == pytest.approx(profile.length_mi)


def test_eta_uses_the_route_travel_time_profile():
    profile = straight_route(120.0, mph=60.0)
    cps = place_checkpoints(profile, 25, departure_s=0)
    # At a steady 60 mph, mile 25 is reached after 25 minutes.
    assert cps[1].eta_s == pytest.approx(25 * 60, rel=1e-3)


def test_progress_entries_set_the_speed_between_them():
    lat = 35.0
    lons = np.linspace(-100, -99, 101)
    points = [(lat, lon) for lon in lons]
    length = float(cumulative_m(np.full(101, lat), lons)[-1])
    # First half fast (10 min), second half slow (50 min).
    progress = [
        {"pointIndex": 0, "distanceInMeters": 0, "travelTimeInSeconds": 0},
        {"pointIndex": 50, "distanceInMeters": length / 2, "travelTimeInSeconds": 600},
        {"pointIndex": 100, "distanceInMeters": length, "travelTimeInSeconds": 3600},
    ]
    profile = build_profile(points, progress, length, 3600)
    assert np.interp(length / 4, profile.dist_m, profile.time_s) == pytest.approx(300, rel=1e-3)
    assert np.interp(3 * length / 4, profile.dist_m, profile.time_s) == pytest.approx(
        2100, rel=1e-3
    )


def test_checkpoint_ranges_meet_halfway():
    cps = place_checkpoints(straight_route(60.0), 25, departure_s=0)
    assert [(c.from_mile, c.to_mile) for c in cps][:2] == [(0.0, 12.5), (12.5, 37.5)]
    assert cps[-1].to_mile == pytest.approx(cps[-1].mile)


def test_requested_spacing_kept_when_within_budget():
    assert choose_spacing([straight_route(300.0)] * 3, 10) == 10


def test_spacing_widens_when_budget_would_be_exceeded():
    profiles = [straight_route(1500.0, n_points=3000, lat=lat) for lat in (35.0, 36.0, 37.0)]
    assert len(checkpoint_cells(profiles, 10)) > CHECKPOINT_CELL_BUDGET
    assert choose_spacing(profiles, 10) == 25
