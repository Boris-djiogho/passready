"""Economic operators and supply-chain suppliers (ESPR Annex III (g)-(k); prEN 18219)."""

from __future__ import annotations

from enum import Enum
from uuid import uuid4

from pydantic import EmailStr, Field, field_validator, model_validator

from app.core.gs1 import validate_gln
from app.models.common import CountryCode, DppBaseModel, HttpsUrl, NonEmptyStr


class Address(DppBaseModel):
    street: NonEmptyStr
    postal_code: NonEmptyStr
    city: NonEmptyStr
    country: CountryCode


class OperatorRole(str, Enum):
    MANUFACTURER = "manufacturer"
    BRAND_OWNER = "brand_owner"
    IMPORTER = "importer"
    AUTHORISED_REPRESENTATIVE = "authorised_representative"


class EconomicOperator(DppBaseModel):
    """The operator responsible for the passport. Needs a unique operator identifier."""

    name: NonEmptyStr
    role: OperatorRole
    eori: str | None = Field(
        default=None,
        pattern=r"^[A-Z]{2}[A-Za-z0-9]{1,15}$",
        description="EORI number (customs identifier, ESPR Annex III (j))",
    )
    gln: str | None = Field(default=None, description="GS1 Global Location Number (13 digits)")
    address: Address
    contact_email: EmailStr | None = None
    website: HttpsUrl | None = None

    @field_validator("gln")
    @classmethod
    def _check_gln(cls, value: str | None) -> str | None:
        return validate_gln(value) if value is not None else None

    @model_validator(mode="after")
    def _needs_unique_operator_id(self) -> EconomicOperator:
        if not self.eori and not self.gln:
            raise ValueError("economic operator needs a unique identifier (EORI or GLN)")
        return self


class SupplierRole(str, Enum):
    """Process step the supplier performs; drives which DPP sections it may fill."""

    FIBER_PRODUCTION = "fiber_production"
    SPINNING = "spinning"
    WEAVING = "weaving"
    KNITTING = "knitting"
    DYEING = "dyeing"
    FINISHING = "finishing"
    GARMENT_MAKING = "garment_making"
    TRIM_SUPPLIER = "trim_supplier"


class SupplierDataStatus(str, Enum):
    PENDING = "pending"
    SUBMITTED = "submitted"
    VERIFIED = "verified"


def _new_supplier_id() -> str:
    return f"sup-{uuid4().hex[:12]}"


class Supplier(DppBaseModel):
    supplier_id: str = Field(default_factory=_new_supplier_id, min_length=1, max_length=64)
    name: NonEmptyStr
    role: SupplierRole
    tier: int = Field(ge=1, le=4, description="1 = direct supplier of the brand")
    country: CountryCode
    facility_gln: str | None = Field(
        default=None, description="Unique facility identifier (GLN), prEN 18219"
    )
    contact_email: EmailStr | None = None
    data_status: SupplierDataStatus = SupplierDataStatus.PENDING

    @field_validator("facility_gln")
    @classmethod
    def _check_gln(cls, value: str | None) -> str | None:
        return validate_gln(value) if value is not None else None
