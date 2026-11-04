"""Role-specific read models. The resolver returns exactly one of these per request.

Need-to-know (prEN 18239): consumers never see supplier identities, certificate numbers or
operator identifiers; recyclers see full material and substance detail but no commercial
data; market surveillance and customs see the complete passport plus the gap report.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import Field

from app.models.certificates import CertificateType
from app.models.chemistry import SubstanceOfConcern
from app.models.circularity import CareSymbol, EndOfLife
from app.models.common import CountryCode, DppViewModel, HttpsUrl
from app.models.completeness import CompletenessReport
from app.models.environment import FootprintMethod, LifecycleBoundary
from app.models.identifiers import Granularity
from app.models.materials import FiberComposition, FiberType
from app.models.passport import DigitalProductPassport, DppStatus, TextileCategory


class PublicIdentifier(DppViewModel):
    gtin: str
    batch: str | None
    serial: str | None
    granularity: Granularity
    digital_link: str


class ResolutionMeta(DppViewModel):
    """How the request was resolved (exact hit or fallback to a less specific passport)."""

    requested_batch: str | None
    requested_serial: str | None
    served_granularity: Granularity
    fallback: bool


class PublicCertificate(DppViewModel):
    type: CertificateType
    issuer: str
    url: HttpsUrl | None
    valid_until: date | None


class ConsumerFiber(DppViewModel):
    fiber: FiberType
    label: str
    percentage: float
    recycled_percentage: float


class ConsumerComposition(DppViewModel):
    component: str
    fibers: list[ConsumerFiber]
    total_recycled_percentage: float


class ConsumerBrand(DppViewModel):
    name: str
    website: HttpsUrl | None


class ConsumerProduct(DppViewModel):
    name: str
    description: str | None
    category: TextileCategory
    country_of_origin: CountryCode | None
    color: str | None
    image_urls: list[HttpsUrl]


class ConsumerCare(DppViewModel):
    care_symbols: list[CareSymbol]
    care_text: str | None
    repair_instructions_url: HttpsUrl | None
    spare_parts_available: bool | None


class ConsumerEnvironment(DppViewModel):
    pcf_kg_co2e: float
    method: FootprintMethod
    boundary: LifecycleBoundary
    verified: bool


class ConsumerChemistry(DppViewModel):
    contains_substances_of_concern: bool
    substances: list[str] = Field(description="Names only (ESPR Art. 7(5) consumer information)")
    pfas_free: bool


class ConsumerEndOfLife(DppViewModel):
    recyclable: bool | None
    recycling_notes: str | None
    take_back_program_url: HttpsUrl | None


class ConsumerPassportView(DppViewModel):
    role: Literal["consumer"] = "consumer"
    identifier: PublicIdentifier
    resolution: ResolutionMeta
    status: DppStatus
    version: int
    published_at: datetime | None
    product: ConsumerProduct
    brand: ConsumerBrand
    composition: list[ConsumerComposition]
    care: ConsumerCare | None
    environment: ConsumerEnvironment | None
    chemistry: ConsumerChemistry | None
    certificates: list[PublicCertificate]
    end_of_life: ConsumerEndOfLife | None


class RecyclerProduct(DppViewModel):
    name: str
    category: TextileCategory
    weight_g: float | None
    mono_material: bool | None


class RecyclerPassportView(DppViewModel):
    role: Literal["recycler"] = "recycler"
    identifier: PublicIdentifier
    resolution: ResolutionMeta
    status: DppStatus
    version: int
    product: RecyclerProduct
    brand_name: str
    compositions: list[FiberComposition]
    substances_of_concern: list[SubstanceOfConcern]
    pfas_free: bool | None
    end_of_life: EndOfLife | None
    certificates: list[PublicCertificate]


class AuthorityPassportView(DppViewModel):
    role: Literal["authority"] = "authority"
    identifier: PublicIdentifier
    resolution: ResolutionMeta
    passport: DigitalProductPassport
    completeness: CompletenessReport


PassportView = Annotated[
    ConsumerPassportView | RecyclerPassportView | AuthorityPassportView,
    Field(discriminator="role"),
]


class LinkTarget(DppViewModel):
    """One entry of a GS1 Digital Link linkset (RFC 9264 style)."""

    href: str
    title: str
    type: str = "application/json"
    hreflang: list[str] = Field(default_factory=lambda: ["de", "en"])
