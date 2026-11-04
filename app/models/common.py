"""Shared base classes and constrained scalar types."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, HttpUrl, StringConstraints


class DppBaseModel(BaseModel):
    """Strict base for stored data: unknown keys are rejected, whitespace is stripped."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, validate_assignment=True)


class DppViewModel(BaseModel):
    """Base for role-specific read models (output only, never stored)."""

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)


class Role(str, Enum):
    """Access roles of the resolver (need-to-know principle, prEN 18239)."""

    CONSUMER = "consumer"
    RECYCLER = "recycler"
    AUTHORITY = "authority"


_LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1"})


def _require_https(url: HttpUrl) -> HttpUrl:
    if url.scheme == "https":
        return url
    if url.scheme == "http" and url.host in _LOCAL_HOSTS:
        return url  # local development only (media served by the dev backend)
    raise ValueError("only https URLs are allowed (http only for localhost)")


HttpsUrl = Annotated[HttpUrl, AfterValidator(_require_https)]
CountryCode = Annotated[
    str, StringConstraints(pattern=r"^[A-Z]{2}$"), Field(description="ISO 3166-1 alpha-2")
]
Percentage = Annotated[float, Field(ge=0.0, le=100.0)]
NonEmptyStr = Annotated[str, StringConstraints(min_length=1, max_length=500)]
Sha256Hex = Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]


def utcnow() -> datetime:
    """Timezone-aware UTC timestamp (all stored timestamps are UTC)."""
    return datetime.now(timezone.utc)
