"""Request validation, and the response shapes documented at /api/docs/.

Coordinates are [lon, lat] pairs; times are UTC ISO 8601 strings; levels are low,
moderate, high, severe or no_travel, and null means No data.
"""

from datetime import datetime
from zoneinfo import available_timezones

from rest_framework import serializers

from trips.services.geo import METERS_PER_MILE, haversine_m
from trips.services.risk import MAX_LOAD_LB, RiskLevel
from trips.services.sampling import DEFAULT_SPACING, SPACING_OPTIONS

LEVELS = [level.key for level in RiskLevel]
ROUTE_SOURCES = ["fastest", "alternative", "eco", "short", "via"]
_TIMEZONES = available_timezones()


def _lon_lat_list(**kwargs) -> serializers.ListField:
    return serializers.ListField(
        child=serializers.ListField(child=serializers.FloatField(), min_length=2, max_length=2),
        **kwargs,
    )


def _level(**kwargs) -> serializers.ChoiceField:
    return serializers.ChoiceField(choices=LEVELS, allow_null=True, **kwargs)


# Requests


class PlaceSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=300)
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)
    timezone = serializers.CharField(
        max_length=64,
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text="IANA time zone, e.g. America/Chicago. Derived from the coordinates if empty.",
    )

    def validate_timezone(self, value: str | None) -> str | None:
        if value and value not in _TIMEZONES:
            raise serializers.ValidationError("Unknown time zone.")
        return value or None


class PlanRequestSerializer(serializers.Serializer):
    origin = PlaceSerializer()
    destination = PlaceSerializer()
    departure_local = serializers.CharField(
        help_text="Wall-clock departure at the origin, without an offset, e.g. 2026-10-12T09:00."
    )
    load_lb = serializers.IntegerField(
        min_value=0, max_value=MAX_LOAD_LB, help_text="Cargo weight in pounds, not gross weight."
    )
    spacing_miles = serializers.ChoiceField(choices=SPACING_OPTIONS, default=DEFAULT_SPACING)
    weather_source = serializers.ChoiceField(choices=["forecast"], default="forecast")

    def validate_departure_local(self, value: str) -> datetime:
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError as exc:
            raise serializers.ValidationError("Use the form YYYY-MM-DDTHH:MM.") from exc
        if parsed.tzinfo is not None:
            raise serializers.ValidationError(
                "Send the local time without an offset; the origin's time zone is applied."
            )
        return parsed.replace(second=0, microsecond=0)

    def validate(self, data: dict) -> dict:
        origin, destination = data["origin"], data["destination"]
        gap = haversine_m(origin["lat"], origin["lon"], destination["lat"], destination["lon"])
        if gap < 0.5 * METERS_PER_MILE:
            raise serializers.ValidationError(
                {"destination": "Origin and destination are the same place."}
            )
        return data


class HeatmapRouteSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=1)
    outline = _lon_lat_list(min_length=2, max_length=2000)

    def validate_outline(self, value: list[list[float]]) -> list[list[float]]:
        if any(not (-180 <= lon <= 180 and -90 <= lat <= 90) for lon, lat in value):
            raise serializers.ValidationError("Coordinates must be [lon, lat] in range.")
        return value


class HeatmapRequestSerializer(serializers.Serializer):
    routes = HeatmapRouteSerializer(many=True, min_length=1, max_length=3)
    departure_utc = serializers.DateTimeField()
    load_lb = serializers.IntegerField(min_value=0, max_value=MAX_LOAD_LB)
    weather_source = serializers.ChoiceField(choices=["forecast"], default="forecast")


# Responses


class HealthSerializer(serializers.Serializer):
    status = serializers.CharField()


class ErrorSerializer(serializers.Serializer):
    detail = serializers.CharField()
    code = serializers.CharField()
    provider = serializers.CharField(required=False)


class PlaceResultSerializer(serializers.Serializer):
    label = serializers.CharField()
    lat = serializers.FloatField()
    lon = serializers.FloatField()
    timezone = serializers.CharField(allow_null=True)


class TripEchoSerializer(serializers.Serializer):
    origin = PlaceResultSerializer()
    destination = PlaceResultSerializer()
    timezone = serializers.CharField(help_text="The origin's time zone; every time is shown in it.")
    departure_utc = serializers.DateTimeField()
    load_lb = serializers.IntegerField()
    spacing_requested = serializers.IntegerField()
    spacing_miles = serializers.IntegerField(help_text="Spacing used, widened if the trip is long.")
    weather_source = serializers.ChoiceField(choices=["forecast"])


class WeatherSerializer(serializers.Serializer):
    wind_mph = serializers.FloatField(
        allow_null=True, help_text="Sustained wind; drives the rules."
    )
    gust_mph = serializers.FloatField(allow_null=True, help_text="Display only.")
    rain_in_hr = serializers.FloatField(allow_null=True, help_text="Rain plus showers.")
    snow_in_hr = serializers.FloatField(allow_null=True)


class ConditionLevelsSerializer(serializers.Serializer):
    wind = _level(help_text="After the load rules.")
    rain = _level()
    snow = _level()


class CheckpointSerializer(serializers.Serializer):
    index = serializers.IntegerField()
    mile = serializers.FloatField()
    lon = serializers.FloatField()
    lat = serializers.FloatField()
    eta_utc = serializers.DateTimeField()
    miles_covered = serializers.FloatField(help_text="Road this checkpoint stands for.")
    weather = WeatherSerializer()
    level = _level()
    condition_levels = ConditionLevelsSerializer()
    load_rule = serializers.IntegerField(allow_null=True)
    reason = serializers.CharField()


class SegmentSerializer(serializers.Serializer):
    checkpoint = serializers.IntegerField()
    level = _level()
    path = _lon_lat_list()


class RouteSummarySerializer(serializers.Serializer):
    length_miles = serializers.FloatField()
    travel_time_s = serializers.IntegerField()
    arrival_utc = serializers.DateTimeField()
    traffic_delay_s = serializers.IntegerField()


class MilesByLevelSerializer(serializers.Serializer):
    low = serializers.FloatField()
    moderate = serializers.FloatField()
    high = serializers.FloatField()
    severe = serializers.FloatField()
    no_travel = serializers.FloatField()


class RouteScoreSerializer(serializers.Serializer):
    miles_by_level = MilesByLevelSerializer()
    no_data_miles = serializers.FloatField()
    average_risk = serializers.FloatField(allow_null=True)
    worst_level = _level()
    complete = serializers.BooleanField()
    has_no_travel = serializers.BooleanField()


class RouteSerializer(serializers.Serializer):
    label = serializers.CharField()
    source = serializers.ChoiceField(choices=ROUTE_SOURCES)
    rank = serializers.IntegerField()
    recommended = serializers.BooleanField()
    summary = RouteSummarySerializer()
    score = RouteScoreSerializer()
    checkpoints = CheckpointSerializer(many=True)
    segments = SegmentSerializer(many=True)
    outline = _lon_lat_list(help_text="Coarse route line; send it back to /api/heatmap/.")


class RecommendationSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["recommended", "no_safe_route", "no_complete_route"])
    route = serializers.CharField(allow_null=True)
    rule = serializers.CharField(allow_null=True)
    message = serializers.CharField()


class PlanResponseSerializer(serializers.Serializer):
    trip = TripEchoSerializer()
    notices = serializers.ListField(child=serializers.CharField())
    routes = RouteSerializer(many=True)
    ranking = serializers.ListField(child=serializers.CharField())
    recommendation = RecommendationSerializer()


class HeatmapResponseSerializer(serializers.Serializer):
    hours = serializers.ListField(
        child=serializers.DateTimeField(), help_text="49 hours from departure."
    )
    points = _lon_lat_list()
    levels = serializers.ListField(
        child=serializers.IntegerField(min_value=-1, max_value=4),
        help_text=(
            "Hour-major: index = hour * len(points) + point. 0 Low to 4 No Travel; -1 No data."
        ),
    )
    wind_mph = serializers.ListField(child=serializers.FloatField(allow_null=True))
    rain_in_hr = serializers.ListField(child=serializers.FloatField(allow_null=True))
    snow_in_hr = serializers.ListField(child=serializers.FloatField(allow_null=True))
    corridor_miles = serializers.IntegerField()
