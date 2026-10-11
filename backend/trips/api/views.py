from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from trips.services.errors import InvalidTrip
from trips.services.geocoding import search_places, timezone_for
from trips.services.heatmap import build_heatmap
from trips.services.planner import Trip, TripPlace, plan_trip
from trips.services.storm import SIMULATED, SimulatedStormProvider, Storm
from trips.services.weather import OpenMeteoProvider, WeatherProvider

from .serializers import (
    ErrorSerializer,
    HealthSerializer,
    HeatmapRequestSerializer,
    HeatmapResponseSerializer,
    PlaceResultSerializer,
    PlanRequestSerializer,
    PlanResponseSerializer,
)

ERRORS = {code: ErrorSerializer for code in (400, 422, 502, 503)}


class PlanThrottle(AnonRateThrottle):
    scope = "plan"


class HeatmapThrottle(AnonRateThrottle):
    scope = "heatmap"


class PlacesThrottle(AnonRateThrottle):
    scope = "places"


def _server_timing(timings: dict[str, float]) -> str:
    return ", ".join(f"{name};dur={ms:.0f}" for name, ms in timings.items())


def _weather_provider(data: dict) -> WeatherProvider:
    """The forecast, or the same simulated storm the plan was scored with."""
    if data["weather_source"] != SIMULATED:
        return OpenMeteoProvider()
    storm = data["storm"]
    return SimulatedStormProvider(
        Storm(lat=storm["lat"], lon=storm["lon"], at_s=round(storm["at_utc"].timestamp()))
    )


def _trip_place(data: dict, role: str) -> TripPlace:
    timezone = data.get("timezone") or timezone_for(data["lat"], data["lon"])
    if not timezone:
        raise InvalidTrip(f"Couldn't tell the {role}'s time zone. Pick a different place.")
    return TripPlace(data["label"], data["lat"], data["lon"], timezone)


class HealthView(APIView):
    @extend_schema(responses=HealthSerializer, summary="Keep-alive and wake-up check")
    def get(self, request: Request) -> Response:
        return Response({"status": "ok"})


class PlacesView(APIView):
    throttle_classes = [PlacesThrottle]

    @extend_schema(
        summary="US place suggestions with coordinates and time zone",
        parameters=[OpenApiParameter("q", str, required=True, description="3 or more characters")],
        responses={
            200: PlaceResultSerializer(many=True),
            400: ErrorSerializer,
            503: ErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        query = request.query_params.get("q", "").strip()
        if len(query) < 3:
            return Response(
                {"detail": "Type at least 3 characters.", "code": "query_too_short"}, status=400
            )
        return Response(search_places(query[:100]))


class PlanView(APIView):
    throttle_classes = [PlanThrottle]

    @extend_schema(
        summary="Plan a trip: three routes, checkpoint risk, ranking and recommendation",
        request=PlanRequestSerializer,
        responses={200: PlanResponseSerializer, **ERRORS},
    )
    def post(self, request: Request) -> Response:
        serializer = PlanRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        trip = Trip(
            origin=_trip_place(data["origin"], "origin"),
            destination=_trip_place(data["destination"], "destination"),
            departure_local=data["departure_local"],
            load_lb=data["load_lb"],
            spacing_miles=data["spacing_miles"],
            weather_source=data["weather_source"],
        )
        plan, timings = plan_trip(trip)
        return Response(plan, headers={"Server-Timing": _server_timing(timings)})


class HeatmapView(APIView):
    throttle_classes = [HeatmapThrottle]

    @extend_schema(
        summary="Corridor risk heatmap: 49 hourly frames from the departure hour",
        request=HeatmapRequestSerializer,
        responses={200: HeatmapResponseSerializer, **ERRORS},
    )
    def post(self, request: Request) -> Response:
        serializer = HeatmapRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        heatmap = build_heatmap(
            [route["outline"] for route in data["routes"]],
            data["departure_utc"],
            data["load_lb"],
            _weather_provider(data),
        )
        return Response(heatmap)
