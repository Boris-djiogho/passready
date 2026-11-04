"""Brand-side request and response contracts (passport authoring)."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from pydantic import Field

from app.models.actors import EconomicOperator, Supplier, SupplierRole
from app.models.certificates import Certificate
from app.models.chemistry import ChemicalCompliance
from app.models.circularity import CareAndDurability, EndOfLife
from app.models.common import DppBaseModel, DppViewModel, HttpsUrl, utcnow
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


class ImageUploadResponse(DppViewModel):
    gtin: str
    url: str
    image_urls: list[HttpsUrl]
    passport_version: int


class ImageOrderRequest(DppBaseModel):
    """New order of the passport's images; URLs left out are removed (uploads are deleted)."""

    image_urls: list[HttpsUrl]


class SupplierStatus(DppViewModel):
    supplier: Supplier
    invitation_valid_until: datetime | None
    portal_link: str | None = Field(default=None, description="Open invitation link, if any")
    days_waiting: int
    reminder_due: bool


def _new_message_id() -> str:
    return f"msg-{uuid4().hex[:12]}"


class OutboxMessage(DppBaseModel):
    """A reminder as it would be sent. The MVP stores it instead of delivering it."""

    message_id: str = Field(default_factory=_new_message_id)
    gtin: str
    supplier_id: str
    channel: str = "email"
    to: str | None
    subject: str
    body: str
    created_at: datetime = Field(default_factory=utcnow)
    delivered: bool = False
    delivery: str = Field(default="outbox", description="outbox | smtp | provider name")


class ReminderRequest(DppBaseModel):
    note: str | None = Field(default=None, max_length=500, description="Personal line for the mail")


class ReminderResponse(DppViewModel):
    supplier_id: str
    supplier_name: str
    message: OutboxMessage
    portal_link: str
    reminder_count: int
    reminded_at: datetime
    warnings: list[str]
