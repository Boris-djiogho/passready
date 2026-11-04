"""Substances of concern and chemical declarations.

ESPR Art. 2(27)-(28) defines substances of concern; Art. 7(5) makes their tracking a DPP
requirement. REACH Art. 33 obliges suppliers to inform about SVHC above 0.1 % (w/w).
"""

from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator, model_validator

from app.models.common import DppBaseModel, HttpsUrl, Percentage

SVHC_INFORMATION_THRESHOLD_PERCENT = 0.1


def validate_cas_number(value: str) -> str:
    """Validate a CAS Registry Number including its check digit."""
    parts = value.split("-")
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        raise ValueError(f"CAS number must look like 1234-56-7, got {value!r}")
    if not (2 <= len(parts[0]) <= 7 and len(parts[1]) == 2 and len(parts[2]) == 1):
        raise ValueError(f"CAS number {value!r} has invalid segment lengths")
    digits = parts[0] + parts[1]
    checksum = sum(int(d) * (i + 1) for i, d in enumerate(reversed(digits))) % 10
    if checksum != int(parts[2]):
        raise ValueError(f"CAS number {value!r} has an invalid check digit")
    return value


class SubstanceOfConcern(DppBaseModel):
    name: str = Field(min_length=1, max_length=200)
    cas_number: str | None = None
    ec_number: str | None = Field(default=None, pattern=r"^\d{3}-\d{3}-\d$")
    concentration_percent: Percentage = Field(description="w/w in the component or article")
    location: str | None = Field(
        default=None, max_length=200, description="Component, e.g. 'DWR finish', 'zipper'"
    )
    svhc_listed: bool = Field(default=True, description="On the REACH candidate list (Art. 59)")
    reason: str | None = Field(default=None, max_length=300)

    @field_validator("cas_number")
    @classmethod
    def _check_cas(cls, value: str | None) -> str | None:
        return validate_cas_number(value) if value is not None else None


class ChemicalCompliance(DppBaseModel):
    reach_svhc_above_threshold: bool = Field(
        description="Any SVHC present above 0.1 % w/w (REACH Art. 33 information duty)"
    )
    substances_of_concern: list[SubstanceOfConcern] = Field(default_factory=list)
    pfas_free: bool = Field(description="No intentionally added PFAS (ECHA universal restriction)")
    pfas_declaration_url: HttpsUrl | None = None
    reach_declaration_url: HttpsUrl | None = None
    certificate_ids: list[str] = Field(
        default_factory=list, description="OEKO-TEX, bluesign, ZDHC MRSL certificates"
    )
    declared_by_supplier_id: str | None = None
    declared_at: datetime | None = None

    @model_validator(mode="after")
    def _flags_match_substances(self) -> ChemicalCompliance:
        above = [
            s
            for s in self.substances_of_concern
            if s.svhc_listed and s.concentration_percent > SVHC_INFORMATION_THRESHOLD_PERCENT
        ]
        if above and not self.reach_svhc_above_threshold:
            names = ", ".join(s.name for s in above)
            raise ValueError(
                f"reach_svhc_above_threshold must be true: {names} exceed(s) 0.1 % w/w"
            )
        if self.reach_svhc_above_threshold and not self.substances_of_concern:
            raise ValueError(
                "reach_svhc_above_threshold is true but no substances of concern are listed"
            )
        return self
