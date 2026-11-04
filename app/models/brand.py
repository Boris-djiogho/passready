"""Brand-side request and response contracts (passport authoring)."""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from app.models.actors import EconomicOperator, Supplier, SupplierRole
from app.models.certificates import Certificate
from app.models.chemistry import ChemicalCompliance
from app.models.circularity import CareAndDurability, EndOfLife
from app.models.common import DppBaseModel, DppViewModel
from app.models.environment import EnvironmentalFootprint
from app.models.identifiers import DppIdentifier
from app.models.materials import FiberComposition
from app.models.passport import ProductInfo
from app.models.supplier import DppSection


class CreatePassportRequest(DppBaseModel):
    identifier: DppIdentifier
    product: ProductInfo
    economic_operator: EconomicOperator
    suppliers: list[Supplier] = Field(default_factory=list)
    fiber_compositions: list[FiberComposition] = Field(default_factory=list)
    environmental_footprint: EnvironmentalFootprint | None = None
    chemical_compliance: ChemicalCompliance | None = None
    certificates: list[Certificate] = Field(default_factory=list)
    care_and_durability: CareAndDurability | None = None
    end_of_life: EndOfLife | None = None


class SupplierInviteRequest(DppBaseModel):
    """Invite a supplier. Either reference an existing supplier_id or describe a new one."""

    supplier_id: str | None = None
    supplier: Supplier | None = None
    allowed_sections: set[DppSection] | None = Field(
        default=None, description="Defaults to the sections typical for the supplier role"
    )
    batch: str | None = None
    serial: str | None = None


class SupplierInviteResponse(DppViewModel):
    supplier_id: str
    supplier_role: SupplierRole
    token: str
    allowed_sections: list[DppSection]
    expires_at: datetime
    update_endpoint: str
    context_endpoint: str
