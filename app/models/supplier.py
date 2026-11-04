"""Supplier portal contracts: invitations (tokens) and partial passport updates."""

from __future__ import annotations

import secrets
from datetime import datetime
from enum import Enum

from pydantic import EmailStr, Field, model_validator

from app.models.actors import Supplier, SupplierRole
from app.models.certificates import Certificate
from app.models.chemistry import ChemicalCompliance
from app.models.common import CountryCode, DppBaseModel, DppViewModel
from app.models.completeness import MissingField
from app.models.environment import EnvironmentalFootprint
from app.models.materials import FiberComposition
from app.models.passport import ContributionRecord, DppStatus


class DppSection(str, Enum):
    FIBER_COMPOSITION = "fiber_compositions"
    CHEMICAL_COMPLIANCE = "chemical_compliance"
    CERTIFICATES = "certificates"
    ENVIRONMENTAL_FOOTPRINT = "environmental_footprint"
    SUPPLIER_DETAILS = "supplier_details"


_COMMON: frozenset[DppSection] = frozenset({DppSection.CERTIFICATES, DppSection.SUPPLIER_DETAILS})
_MATERIAL: frozenset[DppSection] = _COMMON | {DppSection.FIBER_COMPOSITION}
_CHEMISTRY: frozenset[DppSection] = _COMMON | {DppSection.CHEMICAL_COMPLIANCE}

ROLE_DEFAULT_SECTIONS: dict[SupplierRole, frozenset[DppSection]] = {
    SupplierRole.FIBER_PRODUCTION: _MATERIAL,
    SupplierRole.SPINNING: _MATERIAL,
    SupplierRole.WEAVING: _MATERIAL,
    SupplierRole.KNITTING: _MATERIAL,
    SupplierRole.DYEING: _CHEMISTRY,
    SupplierRole.FINISHING: _CHEMISTRY,
    SupplierRole.TRIM_SUPPLIER: _CHEMISTRY,
    SupplierRole.GARMENT_MAKING: _COMMON | {DppSection.ENVIRONMENTAL_FOOTPRINT},
}


def new_supplier_token() -> str:
    return secrets.token_urlsafe(24)


class SupplierInvitation(DppBaseModel):
    """Capability token: which supplier may fill which sections of which passport."""

    token: str = Field(default_factory=new_supplier_token, min_length=8)
    gtin: str
    batch: str | None = None
    serial: str | None = None
    supplier_id: str
    supplier_role: SupplierRole
    allowed_sections: set[DppSection]
    expires_at: datetime
    revoked: bool = False
    created_at: datetime | None = None


class SupplierDetailsPatch(DppBaseModel):
    facility_gln: str | None = None
    contact_email: EmailStr | None = None
    country: CountryCode | None = None


class SupplierUpdateRequest(DppBaseModel):
    """Partial update. Only the sections present are touched; the token decides what is allowed."""

    fiber_compositions: list[FiberComposition] | None = Field(
        default=None, description="Replaces compositions with the same component name"
    )
    chemical_compliance: ChemicalCompliance | None = None
    certificates: list[Certificate] | None = Field(
        default=None, description="Appended; same type and number replaces the existing entry"
    )
    environmental_footprint: EnvironmentalFootprint | None = None
    supplier_details: SupplierDetailsPatch | None = None
    note: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _at_least_one_section(self) -> SupplierUpdateRequest:
        if not self.sections():
            raise ValueError("supplier update must contain at least one data section")
        return self

    def sections(self) -> set[DppSection]:
        present: set[DppSection] = set()
        if self.fiber_compositions is not None:
            present.add(DppSection.FIBER_COMPOSITION)
        if self.chemical_compliance is not None:
            present.add(DppSection.CHEMICAL_COMPLIANCE)
        if self.certificates is not None:
            present.add(DppSection.CERTIFICATES)
        if self.environmental_footprint is not None:
            present.add(DppSection.ENVIRONMENTAL_FOOTPRINT)
        if self.supplier_details is not None:
            present.add(DppSection.SUPPLIER_DETAILS)
        return present


class SupplierUpdateResponse(DppViewModel):
    accepted: bool = True
    gtin: str
    batch: str | None
    serial: str | None
    passport_version: int
    status: DppStatus
    sections_updated: list[DppSection]
    contribution: ContributionRecord
    missing_after_update: list[MissingField]


class SupplierContext(DppViewModel):
    """What a supplier sees when opening its invitation link."""

    supplier: Supplier
    product_name: str
    gtin: str
    batch: str | None
    serial: str | None
    allowed_sections: list[DppSection]
    missing_for_me: list[MissingField]
    expires_at: datetime
