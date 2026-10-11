import json
from pathlib import Path

import pytest
import responses
from django.core.cache import cache
from tenacity import wait_none

from trips.services import http

FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def http_mock():
    """Every test runs offline: unmatched outbound requests fail instead of hitting real APIs."""
    with responses.RequestsMock(assert_all_requests_are_fired=False) as mock:
        yield mock


@pytest.fixture(autouse=True)
def _fresh_cache_and_fast_retries(monkeypatch):
    cache.clear()
    monkeypatch.setattr(http, "RETRY_WAIT", wait_none())
    yield
    cache.clear()
