"""Unique identifiers of a passport (ESPR Art. 10(1)(b), Annex III; prEN 18219)."""

from __future__ import annotations

from enum import Enum
from uuid import uuid4

from pydantic import Field, field_validator

from app.core.gs1 import build_digital_link, normalize_gtin, validate_ai_value
from app.models.common import DppBaseModel


class Granularity(str, Enum):
    """Level at which a passport is issued; the delegated act fixes it per product group."""

    MODEL = "model"
    BATCH = "batch"
    ITEM = "item"


def _new_dpp_urn() -> str:
    return f"urn:uuid:{uuid4()}"


class DppIdentifier(DppBaseModel):
    gtin: str = Field(
        description="GTIN-8/12/13/14 (GS1 AI 01); stored normalised as GTIN-14",
        examples=["04012345678901"],
    )
    batch: str | None = Field(
        default=None, max_length=20, description="Batch / lot number (GS1 AI 10)"
    )
    serial: str | None = Field(default=None, max_length=20, description="Serial number (GS1 AI 21)")
    dpp_id: str = Field(
        default_factory=_new_dpp_urn,
        description="Globally unique passport identifier (URN, ISO/IEC 15459 compatible)",
    )

    @field_validator("gtin")
    @classmethod
    def _normalise_gtin(cls, value: str) -> str:
        return normalize_gtin(value)

    @field_validator("batch")
    @classmethod
    def _check_batch(cls, value: str | None) -> str | None:
        return validate_ai_value(value, "10") if value is not None else None

    @field_validator("serial")
    @classmethod
    def _check_serial(cls, value: str | None) -> str | None:
        return validate_ai_value(value, "21") if value is not None else None

    @property
    def granularity(self) -> Granularity:
        if self.serial:
            return Granularity.ITEM
        if self.batch:
            return Granularity.BATCH
        return Granularity.MODEL

    @property
    def key(self) -> tuple[str, str | None, str | None]:
        """Storage key: one passport per (gtin, batch, serial) combination."""
        return (self.gtin, self.batch, self.serial)

    def digital_link(self, base_url: str) -> str:
        return build_digital_link(base_url, self.gtin, self.batch, self.serial)
