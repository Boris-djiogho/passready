"""Fibre composition (Regulation (EU) 1007/2011 Annex I names; JRC textile DPP data set)."""

from __future__ import annotations

from enum import Enum
from typing import ClassVar

from pydantic import Field, model_validator

from app.models.common import CountryCode, DppBaseModel, NonEmptyStr, Percentage


class FiberType(str, Enum):
    COTTON = "cotton"
    WOOL = "wool"
    SILK = "silk"
    LINEN = "linen"
    HEMP = "hemp"
    JUTE = "jute"
    VISCOSE = "viscose"
    MODAL = "modal"
    LYOCELL = "lyocell"
    CUPRO = "cupro"
    ACETATE = "acetate"
    POLYESTER = "polyester"
    POLYAMIDE = "polyamide"
    ACRYLIC = "acrylic"
    ELASTANE = "elastane"
    POLYPROPYLENE = "polypropylene"
    POLYETHYLENE = "polyethylene"
    POLYLACTIDE = "polylactide"
    ARAMID = "aramid"
    OTHER = "other"


FIBER_LABELS: dict[FiberType, str] = {
    FiberType.COTTON: "Cotton",
    FiberType.WOOL: "Wool",
    FiberType.SILK: "Silk",
    FiberType.LINEN: "Linen",
    FiberType.HEMP: "Hemp",
    FiberType.JUTE: "Jute",
    FiberType.VISCOSE: "Viscose",
    FiberType.MODAL: "Modal",
    FiberType.LYOCELL: "Lyocell",
    FiberType.CUPRO: "Cupro",
    FiberType.ACETATE: "Acetate",
    FiberType.POLYESTER: "Polyester",
    FiberType.POLYAMIDE: "Polyamide",
    FiberType.ACRYLIC: "Acrylic",
    FiberType.ELASTANE: "Elastane",
    FiberType.POLYPROPYLENE: "Polypropylene",
    FiberType.POLYETHYLENE: "Polyethylene",
    FiberType.POLYLACTIDE: "Polylactide",
    FiberType.ARAMID: "Aramid",
    FiberType.OTHER: "Other fibre",
}


class RecycledSource(str, Enum):
    PRE_CONSUMER = "pre_consumer"
    POST_CONSUMER = "post_consumer"
    MIXED = "mixed"


class FiberComponent(DppBaseModel):
    fiber: FiberType
    fiber_name_other: str | None = Field(
        default=None, max_length=120, description="Required when fiber is 'other'"
    )
    percentage: float = Field(gt=0.0, le=100.0, description="Share of this fibre in the part")
    recycled_percentage: Percentage = Field(
        default=0.0, description="Share of this fibre that comes from recycled sources"
    )
    recycled_source: RecycledSource | None = None
    origin_country: CountryCode | None = None
    certificate_ids: list[str] = Field(
        default_factory=list, description="References to Certificate.certificate_id (GRS, GOTS)"
    )

    @model_validator(mode="after")
    def _other_fibre_needs_name(self) -> FiberComponent:
        if self.fiber is FiberType.OTHER and not self.fiber_name_other:
            raise ValueError("fiber_name_other is required when fiber is 'other'")
        return self

    @property
    def label(self) -> str:
        if self.fiber is FiberType.OTHER and self.fiber_name_other:
            return self.fiber_name_other
        return FIBER_LABELS[self.fiber]


class FiberComposition(DppBaseModel):
    """Composition of one garment part. Percentages must total 100 (tolerance 1 point)."""

    TOLERANCE: ClassVar[float] = 1.0

    component: NonEmptyStr = Field(
        default="main_fabric", description="Garment part, e.g. main_fabric, lining, rib_collar"
    )
    fibers: list[FiberComponent] = Field(min_length=1)

    @model_validator(mode="after")
    def _sums_to_100(self) -> FiberComposition:
        total = sum(f.percentage for f in self.fibers)
        if abs(total - 100.0) > self.TOLERANCE:
            raise ValueError(
                f"fibre percentages of '{self.component}' must total 100 "
                f"(tolerance {self.TOLERANCE}), got {total:.2f}"
            )
        return self

    def total_recycled_percentage(self) -> float:
        """Recycled share of the whole part, weighted by fibre share."""
        return round(sum(f.percentage * f.recycled_percentage / 100.0 for f in self.fibers), 2)
