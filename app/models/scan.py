"""Resolver access events. Consumer scans are billable, authority/recycler scans never are."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from pydantic import Field

from app.models.common import DppBaseModel, DppViewModel, Role, utcnow

FREE_ROLES: frozenset[Role] = frozenset({Role.AUTHORITY, Role.RECYCLER})


def _new_scan_id() -> str:
    return f"scan-{uuid4().hex[:12]}"


class ScanEvent(DppBaseModel):
    scan_id: str = Field(default_factory=_new_scan_id)
    gtin: str
    batch: str | None = None
    serial: str | None = None
    role: Role
    billable: bool
    link_type: str | None = None
    user_agent: str | None = Field(default=None, max_length=300)
    occurred_at: datetime = Field(default_factory=utcnow)


class ScanSummary(DppViewModel):
    gtin: str
    total: int
    billable: int
    by_role: dict[str, int]
    free_roles: list[Role]
