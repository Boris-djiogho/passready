"""Shared fixtures: a fresh app with seeded demo data per test (isolated in-memory store)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from app.core.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient

BRAND_HEADERS = {"X-API-Key": "test-brand-key"}
AUTHORITY_HEADERS = {"X-API-Key": "test-authority-key"}
RESOLVER_BASE = "https://id.passready.test"
LANDING_BASE = "https://pass.passready.test"


def make_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "environment": "test",
        "seed_demo_data": True,
        "brand_api_key": "test-brand-key",
        "authority_api_key": "test-authority-key",
        "resolver_base_url": RESOLVER_BASE,
        "landing_page_base_url": None,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[arg-type]


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app(make_settings())) as test_client:
        yield test_client


@pytest.fixture
def client_with_landing() -> Iterator[TestClient]:
    with TestClient(create_app(make_settings(landing_page_base_url=LANDING_BASE))) as test_client:
        yield test_client
