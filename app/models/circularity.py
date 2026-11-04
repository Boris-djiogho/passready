"""Care, durability, repair and end-of-life information (ISO 3758 care symbols)."""

from __future__ import annotations

from enum import Enum

from pydantic import Field

from app.models.common import DppBaseModel, HttpsUrl


class CareSymbol(str, Enum):
    WASH_30 = "wash_30"
    WASH_40 = "wash_40"
    WASH_60 = "wash_60"
    HAND_WASH = "hand_wash"
    DO_NOT_WASH = "do_not_wash"
    BLEACH_ALLOWED = "bleach_allowed"
    NO_BLEACH = "no_bleach"
    TUMBLE_DRY_LOW = "tumble_dry_low"
    TUMBLE_DRY_NORMAL = "tumble_dry_normal"
    NO_TUMBLE_DRY = "no_tumble_dry"
    LINE_DRY = "line_dry"
    IRON_LOW = "iron_low"
    IRON_MEDIUM = "iron_medium"
    IRON_HIGH = "iron_high"
    DO_NOT_IRON = "do_not_iron"
    DRY_CLEAN_P = "dry_clean_p"
    NO_DRY_CLEAN = "no_dry_clean"


class RepairInfo(DppBaseModel):
    instructions_url: HttpsUrl | None = None
    spare_parts_available: bool = False
    repair_service_contact: str | None = Field(default=None, max_length=300)
    repairability_score: float | None = Field(default=None, ge=0.0, le=10.0)


class CareAndDurability(DppBaseModel):
    care_symbols: list[CareSymbol] = Field(default_factory=list)
    care_text: str | None = Field(default=None, max_length=1000)
    tested_wash_cycles: int | None = Field(default=None, ge=0)
    durability_class: str | None = Field(default=None, max_length=50)
    repair: RepairInfo | None = None


class EndOfLife(DppBaseModel):
    recyclable: bool | None = None
    mono_material: bool | None = None
    disassembly_instructions: str | None = Field(default=None, max_length=2000)
    recycling_notes: str | None = Field(default=None, max_length=1000)
    take_back_program_url: HttpsUrl | None = None
