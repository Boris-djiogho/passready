"""Environmental footprint indicators (PEF method, Recommendation (EU) 2021/2279; ISO 14067)."""

from __future__ import annotations

from enum import Enum

from pydantic import Field, model_validator

from app.models.common import DppBaseModel, HttpsUrl


class FootprintMethod(str, Enum):
    PEF = "pef"
    ISO_14067 = "iso_14067"
    GHG_PROTOCOL_PRODUCT = "ghg_protocol_product"
    OTHER = "other"


class LifecycleBoundary(str, Enum):
    CRADLE_TO_GATE = "cradle_to_gate"
    CRADLE_TO_GRAVE = "cradle_to_grave"


class EnvironmentalFootprint(DppBaseModel):
    pcf_kg_co2e: float = Field(ge=0.0, description="Product carbon footprint per unit, kg CO2e")
    method: FootprintMethod
    boundary: LifecycleBoundary
    reference_year: int = Field(ge=2015, le=2100)
    water_consumption_l: float | None = Field(default=None, ge=0.0)
    verified: bool = False
    verifier: str | None = Field(default=None, max_length=200)
    report_url: HttpsUrl | None = None

    @model_validator(mode="after")
    def _verified_needs_verifier(self) -> EnvironmentalFootprint:
        if self.verified and not self.verifier:
            raise ValueError("a verified footprint must name the verifier")
        return self
