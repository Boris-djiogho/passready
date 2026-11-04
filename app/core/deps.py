"""FastAPI dependencies: settings, repository, brand authentication, resolver role resolution."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Query, Request, status

from app.core.config import Settings
from app.models.common import Role
from app.repositories.base import DppRepository


def get_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_repository(request: Request) -> DppRepository:
    repository: DppRepository = request.app.state.repository
    return repository


ApiKeyHeader = Annotated[str | None, Header(alias="X-API-Key")]


def require_brand_key(
    x_api_key: ApiKeyHeader = None, settings: Settings = Depends(get_settings)
) -> None:
    if x_api_key != settings.brand_api_key:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, detail="valid X-API-Key required for brand endpoints"
        )


@dataclass(frozen=True)
class RoleContext:
    role: Role
    explicit: bool


RoleQuery = Annotated[
    Role | None,
    Query(description="Requesting role: consumer (default), recycler or authority"),
]
RoleHeader = Annotated[Role | None, Header(alias="X-DPP-Role")]


def resolve_role(
    role: RoleQuery = None,
    x_dpp_role: RoleHeader = None,
    x_api_key: ApiKeyHeader = None,
    settings: Settings = Depends(get_settings),
) -> RoleContext:
    """Query parameter wins over header; 'authority' additionally needs the authority key."""
    effective = role or x_dpp_role or Role.CONSUMER
    if effective is Role.AUTHORITY and x_api_key != settings.authority_api_key:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="role 'authority' requires a valid X-API-Key (access control, prEN 18239)",
        )
    return RoleContext(role=effective, explicit=role is not None or x_dpp_role is not None)
