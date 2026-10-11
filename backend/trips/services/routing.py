"""Truck routes from TomTom Routing API v1, turned into up to three distinct options.

TomTom's Orbis API has no truck mode, so this uses v1
(docs/adr/0002-tomtom-routing-v1-not-orbis.md). One parallel wave of five single-route
calls asks for the fastest, eco and short routes, plus two routes steered by soft via
points either side of the straight line. Near-duplicates are dropped and the first three
distinct routes are kept. Asking TomTom for alternatives instead measured 11 to 14 s on
800-mile trips; this wave takes about 5 s.
"""

import logging
from collections.abc import Mapping
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import numpy as np
import shapely
from django.conf import settings

from . import http
from .errors import ProviderError, ProviderRejected, ProviderUnavailable, RouteNotFound
from .geo import KG_PER_LB, LocalProjection, cumulative_m

log = logging.getLogger(__name__)

PROVIDER = "TomTom"
URL = "https://api.tomtom.com/routing/1/calculateRoute/{locations}/json"
TIMEOUT_S = 45
MAX_ROUTES = 3

TARE_LB = 35_000
"""Assumed weight of the tractor plus an empty 53-ft trailer."""
RIG = (
    ("vehicleLength", 21.9),  # metres, about 72 ft
    ("vehicleWidth", 2.59),  # 8'6"
    ("vehicleHeight", 4.11),  # 13'6"
    ("vehicleNumberOfAxles", 5),
)

SAME_ROUTE_BUFFER_M = 250
SAME_ROUTE_SHARE = 0.9
SAMPLE_STEP_M = 1_000
NO_ROUTE_CODES = ("NO_ROUTE_FOUND", "MAP_MATCHING_FAILURE")


@dataclass(frozen=True, slots=True)
class Place:
    lat: float
    lon: float


@dataclass(frozen=True, slots=True)
class CandidateRoute:
    source: str
    """How it was produced: fastest, eco, short or via (alternative if TomTom adds more)."""
    summary: Mapping[str, Any]
    points: list[tuple[float, float]]
    progress: list[Mapping[str, Any]]

    @property
    def length_m(self) -> float:
        return float(self.summary["lengthInMeters"])

    @property
    def travel_time_s(self) -> float:
        return float(self.summary["travelTimeInSeconds"])


def vehicle_weight_kg(load_lb: int) -> int:
    """Gross weight for TomTom: cargo plus the assumed tare, in kilograms."""
    return round((load_lb + TARE_LB) * KG_PER_LB)


def request_routes(
    origin: Place,
    destination: Place,
    depart_utc: datetime,
    load_lb: int,
    *,
    route_type: str,
    via: tuple[float, float, int] | None = None,
    source: str | None = None,
) -> list[CandidateRoute]:
    """One calculateRoute call in truck mode for a standard 53-ft tractor-trailer.

    Border crossings are avoided: the routes are for US domestic trips.
    """
    stops = [f"{origin.lat:.6f},{origin.lon:.6f}"]
    if via:
        stops.append(f"circle({via[0]:.6f},{via[1]:.6f},{via[2]})")
    stops.append(f"{destination.lat:.6f},{destination.lon:.6f}")
    params = [
        ("key", settings.TOMTOM_API_KEY),
        ("travelMode", "truck"),
        ("vehicleCommercial", "true"),
        ("vehicleWeight", vehicle_weight_kg(load_lb)),
        *RIG,
        ("routeType", route_type),
        ("avoid", "borderCrossings"),
        ("traffic", "true"),
        ("departAt", depart_utc.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")),
        ("routeRepresentation", "polyline"),
        ("extendedRouteRepresentation", "distance"),
        ("extendedRouteRepresentation", "travelTime"),
        ("computeTravelTimeFor", "all"),
    ]
    response = http.get(
        PROVIDER,
        URL.format(locations=":".join(stops)),
        params,
        timeout=TIMEOUT_S,
        attempts=2,
        retry_timeouts=False,
    )
    if response.status_code in (401, 403):
        raise ProviderRejected(PROVIDER, "TomTom rejected the API key.")
    if response.status_code != 200:
        if any(code in response.text for code in NO_ROUTE_CODES):
            raise RouteNotFound("No truck route was found between these places.")
        log.warning("TomTom %s: %s", response.status_code, response.text[:300])
        raise ProviderUnavailable(PROVIDER, "TomTom couldn't calculate this route.")

    routes = []
    for i, route in enumerate(response.json().get("routes", [])):
        points = [(p["latitude"], p["longitude"]) for leg in route["legs"] for p in leg["points"]]
        routes.append(
            CandidateRoute(
                source=source or (route_type if i == 0 else "alternative"),
                summary=route["summary"],
                points=points,
                progress=route.get("progress", []),
            )
        )
    return routes


def find_routes(
    origin: Place, destination: Place, depart_utc: datetime, load_lb: int
) -> tuple[list[CandidateRoute], list[str]]:
    """Up to three distinct truck routes, plus notices for the user.

    Routes keep the wave's order (fastest, eco, short, via, via), which labels them A to C.
    """
    projection = LocalProjection(
        (origin.lat + destination.lat) / 2, (origin.lon + destination.lon) / 2
    )
    calls = [
        {"route_type": "fastest"},
        {"route_type": "eco"},
        {"route_type": "short"},
        *(
            {"route_type": "fastest", "via": via, "source": "via"}
            for via in _via_points(origin, destination, projection)
        ),
    ]
    routes: list[CandidateRoute] = []
    errors: list[ProviderError | RouteNotFound] = []
    with ThreadPoolExecutor(max_workers=len(calls)) as pool:
        futures = [
            pool.submit(request_routes, origin, destination, depart_utc, load_lb, **call)
            for call in calls
        ]
        for future in futures:
            try:
                routes.extend(future.result())
            except (ProviderError, RouteNotFound) as exc:
                log.info("TomTom call failed: %s", exc)
                errors.append(exc)
    if not routes:
        raise errors[0]

    distinct = _dedupe(routes, projection)
    notices = []
    if len(distinct) == 1:
        notices.append("Only one distinct truck route exists between these places.")
    elif len(distinct) < MAX_ROUTES:
        notices.append(f"Only {len(distinct)} distinct truck routes exist between these places.")
    return distinct[:MAX_ROUTES], notices


def _via_points(
    origin: Place, destination: Place, projection: LocalProjection
) -> list[tuple[float, float, int]]:
    """Soft waypoints offset either side of the straight line's midpoint.

    The offset is 15% of the straight-line distance, between 25 and 100 km; the circle's
    radius is a third of that, so TomTom picks a sensible road through the area.
    """
    (ox,), (oy,) = projection.to_xy([origin.lon], [origin.lat])
    (dx,), (dy,) = projection.to_xy([destination.lon], [destination.lat])
    distance = float(np.hypot(dx - ox, dy - oy))
    if distance < 1:
        return []
    nx, ny = -(dy - oy) / distance, (dx - ox) / distance
    offset = float(np.clip(0.15 * distance, 25_000, 100_000))
    radius = int(min(offset / 3, 135_000))
    mx, my = (ox + dx) / 2, (oy + dy) / 2
    points = []
    for side in (1, -1):
        (lon,), (lat,) = projection.to_lonlat([mx + side * offset * nx], [my + side * offset * ny])
        points.append((float(lat), float(lon), radius))
    return points


class _Shape:
    """A route sampled every kilometre in projected metres, with a 250 m corridor around it."""

    def __init__(self, route: CandidateRoute, projection: LocalProjection) -> None:
        lats = np.array([p[0] for p in route.points])
        lons = np.array([p[1] for p in route.points])
        along = cumulative_m(lats, lons)
        at = np.append(np.arange(0, along[-1], SAMPLE_STEP_M), along[-1])
        self.x, self.y = projection.to_xy(np.interp(at, along, lons), np.interp(at, along, lats))
        line = shapely.linestrings(np.column_stack([self.x, self.y]))
        self.corridor = shapely.buffer(line, SAME_ROUTE_BUFFER_M, quad_segs=2)
        shapely.prepare(self.corridor)

    def share_within(self, other: "_Shape") -> float:
        """Fraction of this route lying within 250 m of the other one."""
        return float(np.mean(shapely.contains_xy(other.corridor, self.x, self.y)))


def _dedupe(routes: list[CandidateRoute], projection: LocalProjection) -> list[CandidateRoute]:
    """Drop routes sharing 90% or more of their length (within 250 m) with an earlier one."""
    kept: list[CandidateRoute] = []
    shapes: list[_Shape] = []
    for route in routes:
        shape = _Shape(route, projection)
        duplicate = any(
            max(shape.share_within(other), other.share_within(shape)) >= SAME_ROUTE_SHARE
            for other in shapes
        )
        if not duplicate:
            kept.append(route)
            shapes.append(shape)
    return kept
