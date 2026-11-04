"""Gap report: which mandatory data points are still missing before publication."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.models.actors import SupplierRole
from app.models.common import DppViewModel, utcnow

Responsible = SupplierRole | Literal["brand"]


class MissingField(DppViewModel):
    path: str = Field(description="JSON path inside the passport document")
    label: str
    source: str = Field(description="Regulatory or normative basis")
    responsible: Responsible | None = Field(default=None, description="Who usually holds this data")
    mandatory: bool = True


class CompletenessReport(DppViewModel):
    complete: bool
    score: float = Field(ge=0.0, le=100.0, description="Fulfilled mandatory checks in percent")
    missing: list[MissingField]
    recommended_missing: list[MissingField]
    checked_at: datetime = Field(default_factory=utcnow)
