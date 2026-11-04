"""Third-party certificates and declarations, with integrity hash (prEN 18246)."""

from __future__ import annotations

from datetime import date
from enum import Enum
from uuid import uuid4

from pydantic import Field, model_validator

from app.models.common import DppBaseModel, HttpsUrl, NonEmptyStr, Sha256Hex


class CertificateType(str, Enum):
    GOTS = "gots"
    GRS = "grs"
    RCS = "rcs"
    OCS = "ocs"
    OEKO_TEX_STANDARD_100 = "oeko_tex_standard_100"
    OEKO_TEX_MADE_IN_GREEN = "oeko_tex_made_in_green"
    BLUESIGN = "bluesign"
    ZDHC_MRSL = "zdhc_mrsl"
    EU_ECOLABEL = "eu_ecolabel"
    REACH_DECLARATION = "reach_declaration"
    PFAS_DECLARATION = "pfas_declaration"
    TEST_REPORT = "test_report"
    OTHER = "other"


def _new_certificate_id() -> str:
    return f"cert-{uuid4().hex[:12]}"


class Certificate(DppBaseModel):
    certificate_id: str = Field(default_factory=_new_certificate_id, min_length=1, max_length=64)
    type: CertificateType
    issuer: NonEmptyStr
    number: str | None = Field(default=None, max_length=100)
    holder_supplier_id: str | None = Field(
        default=None, description="Supplier that holds the certificate; None = the brand"
    )
    scope: str | None = Field(default=None, max_length=300)
    url: HttpsUrl | None = None
    document_sha256: Sha256Hex | None = Field(
        default=None, description="SHA-256 of the certificate document (integrity, prEN 18246)"
    )
    valid_from: date | None = None
    valid_until: date | None = None
    verified: bool = Field(default=False, description="Checked against the issuer's registry")
    public: bool = Field(default=True, description="Visible to consumers and recyclers")

    @model_validator(mode="after")
    def _dates_in_order(self) -> Certificate:
        if self.valid_from and self.valid_until and self.valid_until < self.valid_from:
            raise ValueError("valid_until must not be before valid_from")
        return self

    def is_valid_on(self, day: date) -> bool:
        if self.valid_from and day < self.valid_from:
            return False
        if self.valid_until and day > self.valid_until:
            return False
        return True
