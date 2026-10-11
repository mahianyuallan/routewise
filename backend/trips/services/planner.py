"""Plan a trip: routes, checkpoints, weather at each ETA, risk, ranking and recommendation.

The result is plain JSON-ready data. Coordinates are [lon, lat]; times are UTC ISO strings.
"""

import logging
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime

import numpy as np
import shapely

from .departure import resolve_departure
from .geo import METERS_PER_MILE, LocalProjection, cell_of
from .risk import Assessment, assess_many
from .routing import CandidateRoute, Place, find_routes
from .sampling import Checkpoint, RouteProfile, build_profile, choose_spacing, place_checkpoints
from .scoring import Recommendation, RouteScore, rank, recommend, score_route
from .timeutil import iso_utc
from .weather import OpenMeteoProvider, WeatherProvider, conditions_at

log = logging.getLogger(__name__)

LABELS = ("A", "B", "C")
SEGMENT_TOLERANCE_M = 25
OUTLINE_TOLERANCE_M = 1_000
CHECKPOINTS_PER_ROUTE_BUDGET = 100


@dataclass(frozen=True, slots=True)
class TripPlace:
    label: str
    lat: float
    lon: float
    timezone: str


@dataclass(frozen=True, slots=True)
class Trip:
    origin: TripPlace
    destination: TripPlace
    departure_local: datetime
    """Naive wall-clock time at the origin."""
    load_lb: int
    spacing_miles: int
    weather_source: str = "forecast"


type Router = Callable[[Place, Place, datetime, int], tuple[list[CandidateRoute], list[str]]]


@contextmanager
def _stage(timings: dict[str, float], name: str) -> Iterator[None]:
    start = time.perf_counter()
    try:
        yield
    finally:
        timings[name] = timings.get(name, 0.0) + (time.perf_counter() - start) * 1000


def plan_trip(
    trip: Trip,
    *,
    weather: WeatherProvider | None = None,
    router: Router = find_routes,
    now: datetime | None = None,
) -> tuple[dict, dict[str, float]]:
    """The full plan, plus milliseconds spent on TomTom, weather and everything else."""
    timings: dict[str, float] = {}
    started = time.perf_counter()
    departure = resolve_departure(
        trip.departure_local, trip.origin.timezone, now or datetime.now(UTC)
    )

    with _stage(timings, "tomtom"):
        routes, notices = router(
            Place(trip.origin.lat, trip.origin.lon),
            Place(trip.destination.lat, trip.destination.lon),
            departure,
            trip.load_lb,
        )

    profiles = [build_profile(r.points, r.progress, r.length_m, r.travel_time_s) for r in routes]
    spacing = choose_spacing(profiles, trip.spacing_miles)
    if spacing != trip.spacing_miles:
        reach = trip.spacing_miles * CHECKPOINTS_PER_ROUTE_BUDGET
        notices.append(
            f"{trip.spacing_miles}-mile spacing covers trips up to about {reach:,} miles, "
            f"so checkpoints are every {spacing} miles."
        )
    departure_s = departure.timestamp()
    checkpoints = [place_checkpoints(p, spacing, departure_s) for p in profiles]

    with _stage(timings, "weather"):
        series = (weather or OpenMeteoProvider()).series(
            [cell_of(c.lat, c.lon) for route_cps in checkpoints for c in route_cps]
        )

    assessments = [
        assess_many(
            [conditions_at(series.get(cell_of(c.lat, c.lon)), c.eta_s) for c in route_cps],
            trip.load_lb,
        )
        for route_cps in checkpoints
    ]
    scores = [
        score_route(found, [c.miles_covered for c in route_cps], profile.travel_time_s)
        for found, route_cps, profile in zip(assessments, checkpoints, profiles, strict=True)
    ]
    labels = LABELS[: len(routes)]
    order = rank(scores)
    recommendation = recommend(labels, scores, order)
    projection = LocalProjection(
        (trip.origin.lat + trip.destination.lat) / 2, (trip.origin.lon + trip.destination.lon) / 2
    )

    plan = {
        "trip": {
            "origin": _place(trip.origin),
            "destination": _place(trip.destination),
            "timezone": trip.origin.timezone,
            "departure_utc": iso_utc(departure_s),
            "load_lb": trip.load_lb,
            "spacing_requested": trip.spacing_miles,
            "spacing_miles": spacing,
            "weather_source": trip.weather_source,
        },
        "notices": notices,
        "routes": [
            _route(
                i,
                labels[i],
                routes[i],
                profiles[i],
                checkpoints[i],
                assessments[i],
                scores[i],
                order,
                recommendation,
                departure_s,
                projection,
            )
            for i in range(len(routes))
        ],
        "ranking": [labels[i] for i in order],
        "recommendation": {
            "status": recommendation.status,
            "route": None if recommendation.route is None else labels[recommendation.route],
            "rule": recommendation.rule,
            "message": recommendation.message,
        },
    }
    total_ms = (time.perf_counter() - started) * 1000
    timings["compute"] = max(0.0, total_ms - timings["tomtom"] - timings["weather"])
    log.info(
        "plan %s -> %s, depart %s: %d routes; tomtom %.0f ms, weather %.0f ms, compute %.0f ms",
        trip.origin.label,
        trip.destination.label,
        plan["trip"]["departure_utc"],
        len(routes),
        timings["tomtom"],
        timings["weather"],
        timings["compute"],
    )
    return plan, timings


def _place(place: TripPlace) -> dict:
    return {"label": place.label, "lat": place.lat, "lon": place.lon, "timezone": place.timezone}


def _level_key(level) -> str | None:
    return None if level is None else level.key


def _route(
    index: int,
    label: str,
    route: CandidateRoute,
    profile: RouteProfile,
    checkpoints: list[Checkpoint],
    assessments: list[Assessment],
    score: RouteScore,
    order: list[int],
    recommendation: Recommendation,
    departure_s: float,
    projection: LocalProjection,
) -> dict:
    segments, outline = _geometry(profile, checkpoints, projection)
    return {
        "label": label,
        "source": route.source,
        "rank": order.index(index) + 1,
        "recommended": recommendation.route == index,
        "summary": {
            "length_miles": round(profile.length_mi, 1),
            "travel_time_s": round(profile.travel_time_s),
            "arrival_utc": iso_utc(departure_s + profile.travel_time_s),
            "traffic_delay_s": int(route.summary.get("trafficDelayInSeconds", 0)),
        },
        "score": {
            "miles_by_level": {lvl.key: round(m, 1) for lvl, m in score.miles_by_level.items()},
            "no_data_miles": round(score.no_data_miles, 1),
            "average_risk": None if score.average_risk is None else round(score.average_risk, 2),
            "worst_level": _level_key(score.worst_level),
            "complete": score.complete,
            "has_no_travel": score.has_no_travel,
        },
        "checkpoints": [_checkpoint(c, a) for c, a in zip(checkpoints, assessments, strict=True)],
        "segments": [
            {"checkpoint": c.index, "level": _level_key(a.level), "path": path}
            for c, a, path in zip(checkpoints, assessments, segments, strict=True)
        ],
        "outline": outline,
    }


def _checkpoint(c: Checkpoint, a: Assessment) -> dict:
    return {
        "index": c.index,
        "mile": round(c.mile, 1),
        "lon": round(c.lon, 5),
        "lat": round(c.lat, 5),
        "eta_utc": iso_utc(c.eta_s),
        "miles_covered": round(c.miles_covered, 2),
        "weather": {
            "wind_mph": a.wind_mph,
            "gust_mph": a.gust_mph,
            "rain_in_hr": a.rain_in_hr,
            "snow_in_hr": a.snow_in_hr,
        },
        "level": _level_key(a.level),
        "condition_levels": {
            "wind": _level_key(a.wind),
            "rain": _level_key(a.rain),
            "snow": _level_key(a.snow),
        },
        "load_rule": a.load_rule,
        "reason": a.reason,
    }


def _geometry(
    profile: RouteProfile, checkpoints: list[Checkpoint], projection: LocalProjection
) -> tuple[list[list[list[float]]], list[list[float]]]:
    """Each checkpoint's stretch of road (midpoint to midpoint) and a coarse outline.

    Splitting happens on the full-resolution route before simplifying, so the coloured
    stretches meet exactly where the miles are counted.
    """
    x, y = projection.to_xy(profile.lons, profile.lats)
    d = profile.dist_m
    pieces = []
    for c in checkpoints:
        start, end = c.from_mile * METERS_PER_MILE, c.to_mile * METERS_PER_MILE
        inner = (d > start) & (d < end)
        xs = np.concatenate(([np.interp(start, d, x)], x[inner], [np.interp(end, d, x)]))
        ys = np.concatenate(([np.interp(start, d, y)], y[inner], [np.interp(end, d, y)]))
        pieces.append(shapely.linestrings(np.column_stack([xs, ys])))
    pieces = np.array(pieces, dtype=object)
    # Plain Douglas-Peucker: these are single lines, so topology-preserving mode only costs time.
    simplified = shapely.simplify(pieces, SEGMENT_TOLERANCE_M, preserve_topology=False)
    empty = shapely.is_empty(simplified)
    simplified[empty] = pieces[empty]
    coords, owner = shapely.get_coordinates(simplified, return_index=True)
    lons, lats = projection.to_lonlat(coords[:, 0], coords[:, 1])
    lonlat = np.round(np.column_stack([lons, lats]), 5)
    splits = np.flatnonzero(np.diff(owner)) + 1
    segments = [part.tolist() for part in np.split(lonlat, splits)]

    outline_line = shapely.simplify(
        shapely.linestrings(np.column_stack([x, y])), OUTLINE_TOLERANCE_M, preserve_topology=False
    )
    ox, oy = shapely.get_coordinates(outline_line).T
    outline_lons, outline_lats = projection.to_lonlat(ox, oy)
    outline = np.round(np.column_stack([outline_lons, outline_lats]), 5).tolist()
    return segments, outline
