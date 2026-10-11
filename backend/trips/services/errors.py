"""Domain errors. The API layer turns each one into a readable response."""


class RouteWiseError(Exception):
    """Base class for errors a user can be told about."""


class InvalidTrip(RouteWiseError):
    """The trip can't be planned as entered, e.g. a departure in the past."""


class RouteNotFound(RouteWiseError):
    """The routing provider found no truck route between the two places."""


class ProviderError(RouteWiseError):
    """A third-party API failed. `provider` names it for the user."""

    def __init__(self, provider: str, message: str) -> None:
        super().__init__(message)
        self.provider = provider


class ProviderQuotaExceeded(ProviderError):
    """The provider kept answering 429: its free quota is used up for now."""


class ProviderUnavailable(ProviderError):
    """The provider timed out or kept failing with server errors."""


class ProviderRejected(ProviderError):
    """The provider refused the request, usually because of a missing or bad key."""


class WeatherUnitsMismatch(ProviderError):
    """The weather API answered in units other than mph and inches."""
