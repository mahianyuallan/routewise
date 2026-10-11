"""Turn domain errors into readable JSON responses."""

from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from trips.services.errors import (
    InvalidTrip,
    ProviderError,
    ProviderQuotaExceeded,
    ProviderRejected,
    ProviderUnavailable,
    RouteNotFound,
    WeatherUnitsMismatch,
)

_RESPONSES = (
    (InvalidTrip, 400, "invalid_trip"),
    (RouteNotFound, 422, "no_route"),
    (ProviderQuotaExceeded, 503, "provider_quota"),
    (ProviderRejected, 503, "provider_rejected"),
    (WeatherUnitsMismatch, 502, "weather_units"),
    (ProviderUnavailable, 503, "provider_unavailable"),
)


def exception_handler(exc, context):
    for error_type, status, code in _RESPONSES:
        if isinstance(exc, error_type):
            body = {"detail": str(exc), "code": code}
            if isinstance(exc, ProviderError):
                body["provider"] = exc.provider
            return Response(body, status=status)
    return drf_exception_handler(exc, context)
