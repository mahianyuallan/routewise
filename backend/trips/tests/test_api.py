import json
import re
from datetime import UTC, datetime
from urllib.parse import parse_qs, urlparse

import pytest
import responses
import time_machine
from rest_framework.test import APIClient

from trips.api.serializers import HeatmapResponseSerializer, PlanResponseSerializer
from trips.services import geocoding, weather

from .conftest import load_fixture

TOMTOM = re.compile(r"https://api\.tomtom\.com/routing/1/calculateRoute/.+")
ROUTES = load_fixture("tomtom_dallas_fort_worth.json")["routes"]
SERIES_START = 1_791_676_800  # 2026-10-11 00:00 UTC
TRIP = {
    "origin": {
        "label": "Dallas, TX",
        "lat": 32.7763,
        "lon": -96.7969,
        "timezone": "America/Chicago",
    },
    "destination": {
        "label": "Fort Worth, TX",
        "lat": 32.7555,
        "lon": -97.3308,
        "timezone": "America/Chicago",
    },
    "departure_local": "2026-10-12T09:00",
    "load_lb": 20_000,
    "spacing_miles": 10,
}


@pytest.fixture(autouse=True)
def _frozen_clock_and_test_keys(settings):
    settings.TOMTOM_API_KEY = "test-key"
    settings.GEOAPIFY_API_KEY = "test-key"
    with time_machine.travel(datetime(2026, 10, 11, 12, 0, tzinfo=UTC), tick=False):
        yield


@pytest.fixture
def client():
    return APIClient()


def mock_tomtom(http_mock, status=200):
    """One route per call: fastest and eco agree, short differs, both via calls give a third."""
    answers = {"fastest": ROUTES[:1], "eco": ROUTES[:1], "short": ROUTES[1:2]}

    def callback(request):
        if status != 200:
            return status, {}, json.dumps({"detailedError": {"code": "NO_ROUTE_FOUND"}})
        if "circle(" in request.url:
            return 200, {}, json.dumps({"routes": ROUTES[2:3]})
        route_type = parse_qs(urlparse(request.url).query)["routeType"][0]
        return 200, {}, json.dumps({"routes": answers[route_type]})

    http_mock.add_callback(responses.GET, TOMTOM, callback=callback)


def mock_weather(http_mock, wind=8.0, rain=0.0, snow=0.0, status=200):
    """Open-Meteo answering with the same steady weather for every requested place."""

    def callback(request):
        if status != 200:
            return status, {}, "{}"
        count = len(parse_qs(urlparse(request.url).query)["latitude"][0].split(","))
        hours = 264
        location = {
            "hourly_units": {
                "time": "unixtime",
                "wind_speed_10m": "mp/h",
                "wind_gusts_10m": "mp/h",
                "rain": "inch",
                "showers": "inch",
                "snowfall": "inch",
            },
            "hourly": {
                "time": [SERIES_START + 3600 * h for h in range(hours)],
                "wind_speed_10m": [wind] * hours,
                "wind_gusts_10m": [wind + 10] * hours,
                "rain": [rain] * hours,
                "showers": [0.0] * hours,
                "snowfall": [snow] * hours,
            },
        }
        return 200, {}, json.dumps([location] * count)

    http_mock.add_callback(responses.GET, weather.URL, callback=callback)


def plan(client, **changes):
    return client.post("/api/plan/", {**TRIP, **changes}, format="json")


def test_health(client):
    assert client.get("/api/health/").json() == {"status": "ok"}


def test_places_returns_coordinates_and_time_zone(client, http_mock):
    http_mock.add(
        responses.GET,
        geocoding.URL,
        json={
            "results": [
                {
                    "formatted": "Dallas, TX, United States of America",
                    "lat": 32.7763,
                    "lon": -96.7969,
                    "timezone": {"name": "America/Chicago"},
                },
                {
                    "formatted": "Dallas, GA, United States of America",
                    "lat": 33.9237,
                    "lon": -84.8408,
                },
            ]
        },
    )
    first = client.get("/api/places/", {"q": "Dallas"}).json()
    again = client.get("/api/places/", {"q": "  dallas "}).json()
    assert first[0] == {
        "label": "Dallas, TX, United States of America",
        "lat": 32.7763,
        "lon": -96.7969,
        "timezone": "America/Chicago",
    }
    assert first[1]["timezone"] == "America/New_York"  # derived from coordinates
    assert again == first
    assert len(http_mock.calls) == 1
    query = parse_qs(urlparse(http_mock.calls[0].request.url).query)
    assert query["filter"] == ["countrycode:us"]


def test_places_needs_three_characters(client):
    response = client.get("/api/places/", {"q": "da"})
    assert response.status_code == 400


def test_calm_day_plan_recommends_the_fastest_route(client, http_mock):
    mock_tomtom(http_mock)
    mock_weather(http_mock)
    response = plan(client)
    assert response.status_code == 200, response.json()
    body = response.json()
    PlanResponseSerializer(data=body).is_valid(raise_exception=True)
    assert [r["label"] for r in body["routes"]] == ["A", "B", "C"]
    assert body["recommendation"]["route"] == "A"
    assert body["recommendation"]["rule"] == "travel_time"
    assert body["trip"]["departure_utc"] == "2026-10-12T14:00:00Z"
    for route in body["routes"]:
        assert sum(route["score"]["miles_by_level"].values()) == pytest.approx(
            route["summary"]["length_miles"], abs=0.3
        )
        assert len(route["segments"]) == len(route["checkpoints"])
        assert route["checkpoints"][0]["eta_utc"] == "2026-10-12T14:00:00Z"
    timing = response.headers["Server-Timing"]
    assert all(stage in timing for stage in ("tomtom;dur=", "weather;dur=", "compute;dur="))


def test_severe_wind_ranks_the_route_with_fewest_severe_miles(client, http_mock):
    mock_tomtom(http_mock)
    mock_weather(http_mock, wind=48.0)
    body = plan(client, load_lb=25_000).json()
    assert body["routes"][0]["checkpoints"][1]["level"] == "severe"
    assert body["recommendation"]["route"] == "A"
    assert body["recommendation"]["rule"] == "severe_miles"


def test_load_rule_turns_the_same_wind_into_no_travel(client, http_mock):
    mock_tomtom(http_mock)
    mock_weather(http_mock, wind=48.0)
    body = plan(client, load_lb=35_000).json()
    checkpoint = body["routes"][0]["checkpoints"][1]
    assert checkpoint["level"] == "no_travel"
    assert checkpoint["load_rule"] == 2
    assert body["recommendation"]["status"] == "no_safe_route"
    assert body["recommendation"]["route"] is None


@pytest.mark.parametrize(
    ("changes", "field"),
    [
        ({"load_lb": 45_001}, "load_lb"),
        ({"load_lb": -1}, "load_lb"),
        ({"spacing_miles": 15}, "spacing_miles"),
        ({"departure_local": "tomorrow"}, "departure_local"),
        ({"departure_local": "2026-10-12T09:00-05:00"}, "departure_local"),
        ({"destination": TRIP["origin"]}, "destination"),
    ],
)
def test_invalid_trips_are_rejected(client, changes, field):
    response = plan(client, **changes)
    assert response.status_code == 400
    assert field in response.json()


def test_past_departure_is_rejected(client):
    response = plan(client, departure_local="2026-10-11T05:00")
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_trip"


def test_no_route_found_is_a_422(client, http_mock):
    mock_tomtom(http_mock, status=400)
    response = plan(client)
    assert response.status_code == 422
    assert response.json()["code"] == "no_route"


def test_weather_quota_is_a_503_naming_the_provider(client, http_mock):
    mock_tomtom(http_mock)
    mock_weather(http_mock, status=429)
    response = plan(client)
    assert response.status_code == 503
    assert response.json() | {"detail": None} == {
        "detail": None,
        "code": "provider_quota",
        "provider": "Open-Meteo",
    }


def test_heatmap_starts_at_the_departure_hour(client, http_mock):
    mock_tomtom(http_mock)
    mock_weather(http_mock, wind=30.0)
    planned = plan(client).json()
    response = client.post(
        "/api/heatmap/",
        {
            "routes": [{"label": r["label"], "outline": r["outline"]} for r in planned["routes"]],
            "departure_utc": "2026-10-12T14:20:00Z",
            "load_lb": 20_000,
        },
        format="json",
    )
    assert response.status_code == 200, response.json()
    body = response.json()
    HeatmapResponseSerializer(data=body).is_valid(raise_exception=True)
    assert body["hours"][0] == "2026-10-12T14:00:00Z"
    assert len(body["hours"]) == 49
    assert 0 < len(body["points"]) <= 200
    assert len(body["levels"]) == 49 * len(body["points"])
    assert set(body["levels"]) == {1}  # 30 mph is Moderate everywhere


def test_heatmap_accepts_at_most_three_routes(client):
    outline = [[-96.8, 32.78], [-97.3, 32.75]]
    response = client.post(
        "/api/heatmap/",
        {
            "routes": [{"label": x, "outline": outline} for x in "ABCD"],
            "departure_utc": "2026-10-12T14:00:00Z",
            "load_lb": 0,
        },
        format="json",
    )
    assert response.status_code == 400


def test_openapi_schema_builds(client):
    response = client.get("/api/schema/")
    assert response.status_code == 200
    assert b"PlanResponse" in response.content
