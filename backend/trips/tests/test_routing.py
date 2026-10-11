import itertools
import json
import re
from datetime import UTC, datetime
from urllib.parse import parse_qs, urlparse

import numpy as np
import pytest
import responses

from trips.services.errors import ProviderRejected, RouteNotFound
from trips.services.geo import LocalProjection
from trips.services.routing import (
    Place,
    _via_points,
    find_routes,
    request_routes,
    vehicle_weight_kg,
)

from .conftest import load_fixture

TOMTOM = re.compile(r"https://api\.tomtom\.com/routing/1/calculateRoute/.+")
DALLAS = Place(32.7763, -96.7969)
FORT_WORTH = Place(32.7555, -97.3308)
DEPART = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
FIXTURE = load_fixture("tomtom_dallas_fort_worth.json")


@pytest.fixture(autouse=True)
def _test_key(settings):
    settings.TOMTOM_API_KEY = "test-key"


def body(*indexes):
    return {"formatVersion": "0.0.12", "routes": [FIXTURE["routes"][i] for i in indexes]}


def mock_tomtom(http_mock, answer):
    """`answer(route_type, is_via)` returns (status, json body) for each call."""

    def callback(request):
        query = parse_qs(urlparse(request.url).query)
        status, payload = answer(query["routeType"][0], "circle(" in request.url)
        return status, {}, json.dumps(payload)

    http_mock.add_callback(responses.GET, TOMTOM, callback=callback)


def via_calls(http_mock):
    return [c for c in http_mock.calls if "circle(" in c.request.url]


def test_vehicle_weight_adds_the_tare_and_converts_to_kg():
    assert vehicle_weight_kg(0) == 15_876
    assert vehicle_weight_kg(40_000) == 34_019
    assert vehicle_weight_kg(45_000) == 36_287  # 80,000 lb gross


def test_request_describes_a_loaded_53_ft_truck(http_mock):
    mock_tomtom(http_mock, lambda *_: (200, body(0)))
    request_routes(DALLAS, FORT_WORTH, DEPART, 40_000, route_type="fastest")
    query = parse_qs(urlparse(http_mock.calls[0].request.url).query)
    assert query["travelMode"] == ["truck"]
    assert query["vehicleCommercial"] == ["true"]
    assert query["vehicleWeight"] == ["34019"]
    assert query["vehicleLength"] == ["21.9"]
    assert query["vehicleWidth"] == ["2.59"]
    assert query["vehicleHeight"] == ["4.11"]
    assert query["vehicleNumberOfAxles"] == ["5"]
    assert query["avoid"] == ["borderCrossings"]
    assert query["departAt"] == ["2026-10-12T14:00:00Z"]
    assert query["extendedRouteRepresentation"] == ["distance", "travelTime"]
    assert query["computeTravelTimeFor"] == ["all"]
    assert "maxAlternatives" not in query


def test_routes_are_parsed_with_points_and_progress(http_mock):
    mock_tomtom(http_mock, lambda *_: (200, body(0, 1, 2)))
    routes = request_routes(DALLAS, FORT_WORTH, DEPART, 0, route_type="fastest")
    assert [r.source for r in routes] == ["fastest", "alternative", "alternative"]
    assert len(routes[0].points) == 751
    assert routes[0].progress[-1]["distanceInMeters"] == routes[0].length_m == 52_260


def test_via_points_sit_either_side_of_the_straight_line():
    projection = LocalProjection(32.766, -97.06)
    left, right = _via_points(DALLAS, FORT_WORTH, projection)
    (ox,), (oy,) = projection.to_xy([DALLAS.lon], [DALLAS.lat])
    (dx,), (dy,) = projection.to_xy([FORT_WORTH.lon], [FORT_WORTH.lat])
    sides = []
    for lat, lon, radius in (left, right):
        (px,), (py,) = projection.to_xy([lon], [lat])
        sides.append(np.sign((dx - ox) * (py - oy) - (dy - oy) * (px - ox)))
        offset = np.hypot(px - (ox + dx) / 2, py - (oy + dy) / 2)
        assert offset == pytest.approx(25_000, rel=1e-3)  # a 50 km trip gets the 25 km minimum
        assert radius == 8_333
    assert sides == [1, -1]


def test_one_wave_of_five_calls_keeps_the_first_three_distinct_routes(http_mock):
    def answer(route_type, is_via):
        if is_via:
            return 200, body(2)
        return 200, {"fastest": body(0), "eco": body(0), "short": body(1)}[route_type]

    mock_tomtom(http_mock, answer)
    routes, notices = find_routes(DALLAS, FORT_WORTH, DEPART, 20_000)
    assert len(http_mock.calls) == 5
    assert len(via_calls(http_mock)) == 2
    assert [r.source for r in routes] == ["fastest", "short", "via"]
    assert [r.length_m for r in routes] == [52_260, 59_197, 65_910]
    assert notices == []


def test_via_points_fill_in_when_tomtom_returns_one_route(http_mock):
    via_answers = itertools.cycle([body(1), body(2)])

    def answer(route_type, is_via):
        return 200, next(via_answers) if is_via else body(0)

    mock_tomtom(http_mock, answer)
    routes, notices = find_routes(DALLAS, FORT_WORTH, DEPART, 20_000)
    assert [r.source for r in routes] == ["fastest", "via", "via"]
    assert notices == []
    assert len(via_calls(http_mock)) == 2


def test_fewer_routes_are_shown_with_a_notice(http_mock):
    mock_tomtom(http_mock, lambda *_: (200, body(0)))
    routes, notices = find_routes(DALLAS, FORT_WORTH, DEPART, 20_000)
    assert len(routes) == 1
    assert notices == ["Only one distinct truck route exists between these places."]


def test_a_failed_variant_does_not_block_the_plan(http_mock):
    def answer(route_type, is_via):
        if is_via:
            return 200, body(2)
        return {"fastest": (200, body(0)), "eco": (500, {}), "short": (200, body(1))}[route_type]

    mock_tomtom(http_mock, answer)
    routes, _ = find_routes(DALLAS, FORT_WORTH, DEPART, 20_000)
    assert len(routes) == 3


def test_no_route_found(http_mock):
    error = {"detailedError": {"code": "NO_ROUTE_FOUND", "message": "No route found."}}
    mock_tomtom(http_mock, lambda *_: (400, error))
    with pytest.raises(RouteNotFound):
        find_routes(DALLAS, FORT_WORTH, DEPART, 20_000)


def test_rejected_key(http_mock):
    mock_tomtom(http_mock, lambda *_: (403, {"detailedError": {"code": "Forbidden"}}))
    with pytest.raises(ProviderRejected):
        find_routes(DALLAS, FORT_WORTH, DEPART, 20_000)
