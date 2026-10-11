"""Outbound GET with one timeout policy and retries on 429, 5xx and timeouts."""

from collections.abc import Mapping, Sequence
from typing import Any

import requests
from tenacity import Retrying, retry_if_exception_type, stop_after_attempt, wait_exponential

from .errors import ProviderQuotaExceeded, ProviderUnavailable

RETRY_WAIT = wait_exponential(multiplier=0.5, max=4)


class _Retryable(Exception):
    def __init__(self, status: int | None) -> None:
        super().__init__(status)
        self.status = status


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
            raise _Retryable(response.status_code)
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
            raise ProviderQuotaExceeded(
                provider, f"{provider}'s free quota is used up for now. Try again later."
            ) from exc
        raise ProviderUnavailable(
            provider, f"{provider} isn't responding right now. Try again in a minute."
        ) from exc
    raise AssertionError("unreachable")
