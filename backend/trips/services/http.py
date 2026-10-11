"""Outbound GET with one timeout policy and retries on 429, 5xx and timeouts."""

import logging
from collections.abc import Mapping, Sequence
from typing import Any

import requests
from tenacity import Retrying, retry_if_exception_type, stop_after_attempt, wait_exponential

from .errors import ProviderQuotaExceeded, ProviderUnavailable

log = logging.getLogger(__name__)

RETRY_WAIT = wait_exponential(multiplier=0.5, max=4)


class _Retryable(Exception):
    def __init__(self, status: int | None, reason: str = "") -> None:
        super().__init__(status)
        self.status = status
        self.reason = reason


def _reason(response: requests.Response) -> str:
    """The provider's own explanation of a refusal, e.g. Open-Meteo's {"reason": "..."}."""
    try:
        body = response.json()
    except ValueError:
        return ""
    if isinstance(body, dict):
        for key in ("reason", "detail", "message"):
            value = body.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()[:200]
    return ""


def quota_message(provider: str, reason: str) -> str:
    """Say which limit was hit when the provider tells us, so the user knows how long to wait.

    Open-Meteo's free tier counts calls per minute, hour and day for each IP address, and a
    free Render instance shares its outbound addresses with other services.
    """
    text = reason.lower()
    if "minut" in text:
        return f"{provider}'s per-minute limit was reached. Try again in a minute."
    if "hour" in text:
        return f"{provider}'s hourly free quota is used up. Try again later this hour."
    if "dai" in text or "day" in text or "tomorrow" in text:
        return f"{provider}'s daily free quota is used up. Try again tomorrow."
    return f"{provider}'s free quota is used up for now. Try again later."


def get(
    provider: str,
    url: str,
    params: Mapping[str, Any] | Sequence[tuple[str, Any]],
    *,
    timeout: float,
    attempts: int = 3,
    retry_timeouts: bool = True,
) -> requests.Response:
    """GET `url`, retrying 429, 5xx and network errors with backoff.

    Returns any other response (2xx or 4xx) for the caller to interpret. Each call makes its
    own request, so it is safe to run from several threads at once.
    """

    def once() -> requests.Response:
        try:
            response = requests.get(url, params=params, timeout=timeout)
        except requests.Timeout as exc:
            if not retry_timeouts:
                raise ProviderUnavailable(provider, f"{provider} took too long to answer.") from exc
            raise _Retryable(None) from exc
        except requests.ConnectionError as exc:
            raise _Retryable(None) from exc
        if response.status_code == 429 or response.status_code >= 500:
            raise _Retryable(response.status_code, _reason(response))
        return response

    try:
        for attempt in Retrying(
            stop=stop_after_attempt(attempts),
            wait=RETRY_WAIT,
            retry=retry_if_exception_type(_Retryable),
            reraise=True,
        ):
            with attempt:
                return once()
    except _Retryable as exc:
        if exc.status == 429:
            log.warning("%s answered 429: %s", provider, exc.reason or "no reason given")
            raise ProviderQuotaExceeded(provider, quota_message(provider, exc.reason)) from exc
        raise ProviderUnavailable(
            provider, f"{provider} isn't responding right now. Try again in a minute."
        ) from exc
    raise AssertionError("unreachable")
