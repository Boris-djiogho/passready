"""The aggregate: one Digital Product Passport for one textile product (model, batch or item)."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from uuid import uuid4

from pydantic import Field, model_validator

from app.models.actors import EconomicOperator, Supplier, SupplierRole
from app.models.certificates import Certificate
from app.models.chemistry import ChemicalCompliance
from app.models.circularity import CareAndDurability, EndOfLife
from app.models.common import CountryCode, DppBaseModel, HttpsUrl, NonEmptyStr, Sha256Hex, utcnow
from app.models.environment import EnvironmentalFootprint
from app.models.identifiers import DppIdentifier
from app.models.materials import FiberComposition


class TextileCategory(str, Enum):
    T_SHIRT = "t_shirt"
    SHIRT = "shirt"
    TROUSERS = "trousers"
    DRESS = "dress"
    SKIRT = "skirt"
    JACKET = "jacket"
    COAT = "coat"
    KNITWEAR = "knitwear"
    UNDERWEAR = "underwear"
    SPORTSWEAR = "sportswear"
    ACCESSORY = "accessory"
    OTHER = "other"


class ProductInfo(DppBaseModel):
    name: NonEmptyStr
    description: str | None = Field(default=None, max_length=2000)
    category: TextileCategory
    taric_code: str | None = Field(
        default=None,
        pattern=r"^\d{8}(\d{2})?$",
        description="CN/TARIC commodity code (ESPR Annex III (d)), 8 or 10 digits",
    )
    country_of_origin: CountryCode | None = Field(
        default=None, description="Country of the last substantial manufacturing step"
    )
    color: str | None = Field(default=None, max_length=100)
    size_range: str | None = Field(default=None, max_length=100)
    season: str | None = Field(default=None, max_length=50)
    weight_g: float | None = Field(default=None, gt=0.0)
    image_urls: list[HttpsUrl] = Field(default_factory=list)


class DppStatus(str, Enum):
    """Lifecycle (prEN 18222 lifecycle actions): draft -> collecting -> review -> published."""

    DRAFT = "draft"
    PENDING_SUPPLIER_DATA = "pending_supplier_data"
    IN_REVIEW = "in_review"
    PUBLISHED = "published"
    WITHDRAWN = "withdrawn"


class ActorType(str, Enum):
    BRAND = "brand"
    SUPPLIER = "supplier"
    SYSTEM = "system"


def _new_contribution_id() -> str:
    return f"contrib-{uuid4().hex[:12]}"


class ContributionRecord(DppBaseModel):
    """Audit trail entry: who changed which sections, with a hash of the payload (prEN 18246)."""

    contribution_id: str = Field(default_factory=_new_contribution_id)
    actor_type: ActorType
    actor_id: str = Field(min_length=1, max_length=64)
    supplier_role: SupplierRole | None = None
    sections: list[str] = Field(min_length=1)
    payload_sha256: Sha256Hex
    created_at: datetime = Field(default_factory=utcnow)
    note: str | None = Field(default=None, max_length=500)


class DigitalProductPassport(DppBaseModel):
    identifier: DppIdentifier
    status: DppStatus = DppStatus.DRAFT
    version: int = Field(default=1, ge=1)
    product: ProductInfo
    economic_operator: EconomicOperator
    suppliers: list[Supplier] = Field(default_factory=list)
    fiber_compositions: list[FiberComposition] = Field(default_factory=list)
    environmental_footprint: EnvironmentalFootprint | None = None
    chemical_compliance: ChemicalCompliance | None = None
    certificates: list[Certificate] = Field(default_factory=list)
    care_and_durability: CareAndDurability | None = None
    end_of_life: EndOfLife | None = None
    contributions: list[ContributionRecord] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    published_at: datetime | None = None

    @model_validator(mode="after")
    def _references_are_consistent(self) -> DigitalProductPassport:
        components = [c.component for c in self.fiber_compositions]
        if len(components) != len(set(components)):
            raise ValueError("fibre composition components must be unique per passport")

        supplier_ids = [s.supplier_id for s in self.suppliers]
        if len(supplier_ids) != len(set(supplier_ids)):
            raise ValueError("supplier_id values must be unique per passport")

        certificate_ids = [c.certificate_id for c in self.certificates]
        if len(certificate_ids) != len(set(certificate_ids)):
            raise ValueError("certificate_id values must be unique per passport")

        known = set(certificate_ids)
        referenced = {
            cid
            for comp in self.fiber_compositions
            for f in comp.fibers
            for cid in f.certificate_ids
        }
        if self.chemical_compliance:
            referenced.update(self.chemical_compliance.certificate_ids)
        missing = referenced - known
        if missing:
            raise ValueError(f"unknown certificate references: {sorted(missing)}")

        known_suppliers = set(supplier_ids)
        holders = {c.holder_supplier_id for c in self.certificates if c.holder_supplier_id}
        unknown_holders = holders - known_suppliers
        if unknown_holders:
            raise ValueError(f"certificates reference unknown suppliers: {sorted(unknown_holders)}")
        return self

    def supplier_by_id(self, supplier_id: str) -> Supplier | None:
        return next((s for s in self.suppliers if s.supplier_id == supplier_id), None)


class PassportSummary(DppBaseModel):
    """Compact list entry for brand dashboards."""

    gtin: str
    batch: str | None
    serial: str | None
    dpp_id: str
    product_name: str
    status: DppStatus
    version: int
    updated_at: datetime
