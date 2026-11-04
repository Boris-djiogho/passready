"""Demo data: one published T-shirt passport (model + batch level) and one draft denim jacket
waiting for supplier input. Tokens and GTINs are fixed so tests and demos can rely on them."""

from __future__ import annotations

from datetime import date, timedelta

from pydantic import HttpUrl

from app.models.actors import (
    Address,
    EconomicOperator,
    OperatorRole,
    Supplier,
    SupplierDataStatus,
    SupplierRole,
)
from app.models.certificates import Certificate, CertificateType
from app.models.chemistry import ChemicalCompliance
from app.models.circularity import CareAndDurability, CareSymbol, EndOfLife, RepairInfo
from app.models.common import utcnow
from app.models.environment import EnvironmentalFootprint, FootprintMethod, LifecycleBoundary
from app.models.identifiers import DppIdentifier
from app.models.materials import FiberComponent, FiberComposition, FiberType, RecycledSource
from app.models.passport import (
    ActorType,
    ContributionRecord,
    DigitalProductPassport,
    DppStatus,
    ProductInfo,
    TextileCategory,
)
from app.models.supplier import ROLE_DEFAULT_SECTIONS, SupplierInvitation
from app.repositories.base import DppRepository

DEMO_GTIN_TEE = "04012345678901"
DEMO_BATCH_TEE = "LOT2026A"
DEMO_GTIN_JACKET = "04012345000016"
DEMO_SUPPLIER_WEAVING_ID = "sup-ege-denim"
DEMO_SUPPLIER_DYEING_ID = "sup-mavi-boya"
DEMO_TOKEN_WEAVING = "demo-token-weaving-2026"
DEMO_TOKEN_DYEING = "demo-token-dyeing-2026"

_HASH_A = "a" * 64
_HASH_B = "b" * 64
_HASH_C = "c" * 64
_HASH_D = "d" * 64

BRAND = EconomicOperator(
    name="Nordlicht Apparel GmbH",
    role=OperatorRole.BRAND_OWNER,
    eori="DE123456789012345",
    gln="4012345000009",
    address=Address(street="Lange Reihe 12", postal_code="20099", city="Hamburg", country="DE"),
    contact_email="dpp@nordlicht.example.org",
    website=HttpUrl("https://nordlicht-apparel.example"),
)


def _tee_passport() -> DigitalProductPassport:
    now = utcnow()
    suppliers = [
        Supplier(
            supplier_id="sup-tecelagem",
            name="Tecelagem Minho Lda",
            role=SupplierRole.WEAVING,
            tier=2,
            country="PT",
            facility_gln="4012345000016",
            contact_email="qualidade@tecelagem.example.org",
            data_status=SupplierDataStatus.VERIFIED,
        ),
        Supplier(
            supplier_id="sup-tintura",
            name="Tintura Verde SA",
            role=SupplierRole.DYEING,
            tier=2,
            country="PT",
            contact_email="compliance@tintura.example.org",
            data_status=SupplierDataStatus.SUBMITTED,
        ),
        Supplier(
            supplier_id="sup-confeccoes",
            name="Confeccoes Braga Lda",
            role=SupplierRole.GARMENT_MAKING,
            tier=1,
            country="PT",
            data_status=SupplierDataStatus.SUBMITTED,
        ),
    ]
    certificates = [
        Certificate(
            certificate_id="cert-gots-tecelagem",
            type=CertificateType.GOTS,
            issuer="Control Union Certifications",
            number="CU 812345",
            holder_supplier_id="sup-tecelagem",
            scope="Organic cotton yarn and fabric",
            url=HttpUrl("https://certificates.example/gots/CU-812345"),
            valid_from=date(2026, 1, 15),
            valid_until=date(2027, 1, 14),
            verified=True,
        ),
        Certificate(
            certificate_id="cert-grs-tecelagem",
            type=CertificateType.GRS,
            issuer="Control Union Certifications",
            number="CU 812346",
            holder_supplier_id="sup-tecelagem",
            scope="Recycled cotton content (post-consumer)",
            url=HttpUrl("https://certificates.example/grs/CU-812346"),
            valid_from=date(2026, 1, 15),
            valid_until=date(2027, 1, 14),
            verified=True,
        ),
        Certificate(
            certificate_id="cert-oekotex-tintura",
            type=CertificateType.OEKO_TEX_STANDARD_100,
            issuer="Hohenstein",
            number="25.HUS.12345",
            holder_supplier_id="sup-tintura",
            scope="Dyed cotton jersey, product class II",
            url=HttpUrl("https://certificates.example/oeko-tex/25.HUS.12345"),
            valid_from=date(2026, 3, 1),
            valid_until=date(2027, 2, 28),
            verified=True,
        ),
        Certificate(
            certificate_id="cert-pfas-tintura",
            type=CertificateType.PFAS_DECLARATION,
            issuer="Tintura Verde SA",
            holder_supplier_id="sup-tintura",
            scope="No intentionally added PFAS in finishing recipes",
            url=HttpUrl("https://tintura-verde.example/declarations/pfas-2026.pdf"),
            document_sha256=_HASH_D,
            valid_from=date(2026, 2, 1),
            public=False,
        ),
    ]
    return DigitalProductPassport(
        identifier=DppIdentifier(
            gtin=DEMO_GTIN_TEE, dpp_id="urn:uuid:3d3b0a7e-0001-4c1f-9c4e-000000000001"
        ),
        status=DppStatus.PUBLISHED,
        version=4,
        product=ProductInfo(
            name="Nordlicht Organic Tee",
            description="Heavyweight organic cotton T-shirt, garment-dyed in Portugal.",
            category=TextileCategory.T_SHIRT,
            taric_code="61091000",
            country_of_origin="PT",
            color="Nebelgrau",
            size_range="XS-XXL",
            season="SS26",
            weight_g=180.0,
            image_urls=[HttpUrl("https://cdn.nordlicht-apparel.example/tee-nebelgrau.jpg")],
        ),
        economic_operator=BRAND,
        suppliers=suppliers,
        fiber_compositions=[
            FiberComposition(
                component="main_fabric",
                fibers=[
                    FiberComponent(
                        fiber=FiberType.COTTON,
                        percentage=95.0,
                        recycled_percentage=20.0,
                        recycled_source=RecycledSource.POST_CONSUMER,
                        origin_country="TR",
                        certificate_ids=["cert-gots-tecelagem", "cert-grs-tecelagem"],
                    ),
                    FiberComponent(fiber=FiberType.ELASTANE, percentage=5.0),
                ],
            ),
            FiberComposition(
                component="rib_collar",
                fibers=[
                    FiberComponent(
                        fiber=FiberType.COTTON,
                        percentage=100.0,
                        origin_country="TR",
                        certificate_ids=["cert-gots-tecelagem"],
                    )
                ],
            ),
        ],
        environmental_footprint=EnvironmentalFootprint(
            pcf_kg_co2e=3.8,
            method=FootprintMethod.PEF,
            boundary=LifecycleBoundary.CRADLE_TO_GATE,
            reference_year=2026,
            water_consumption_l=2700.0,
        ),
        chemical_compliance=ChemicalCompliance(
            reach_svhc_above_threshold=False,
            pfas_free=True,
            pfas_declaration_url=HttpUrl(
                "https://tintura-verde.example/declarations/pfas-2026.pdf"
            ),
            certificate_ids=["cert-oekotex-tintura", "cert-pfas-tintura"],
            declared_by_supplier_id="sup-tintura",
            declared_at=now - timedelta(days=40),
        ),
        certificates=certificates,
        care_and_durability=CareAndDurability(
            care_symbols=[
                CareSymbol.WASH_30,
                CareSymbol.NO_BLEACH,
                CareSymbol.TUMBLE_DRY_LOW,
                CareSymbol.IRON_MEDIUM,
                CareSymbol.NO_DRY_CLEAN,
            ],
            care_text="Wash inside out with similar colours.",
            tested_wash_cycles=50,
            repair=RepairInfo(
                instructions_url=HttpUrl("https://nordlicht-apparel.example/repair/tee"),
                spare_parts_available=False,
            ),
        ),
        end_of_life=EndOfLife(
            recyclable=True,
            mono_material=False,
            disassembly_instructions=(
                "Cut off the woven brand label and the care label before fibre recycling."
            ),
            recycling_notes=(
                "Cotton/elastane blend; suitable for mechanical recycling after label removal."
            ),
            take_back_program_url=HttpUrl("https://nordlicht-apparel.example/takeback"),
        ),
        contributions=[
            ContributionRecord(
                actor_type=ActorType.BRAND,
                actor_id="brand",
                sections=["passport_created"],
                payload_sha256=_HASH_A,
                created_at=now - timedelta(days=90),
            ),
            ContributionRecord(
                actor_type=ActorType.SUPPLIER,
                actor_id="sup-tecelagem",
                supplier_role=SupplierRole.WEAVING,
                sections=["certificates", "fiber_compositions"],
                payload_sha256=_HASH_B,
                created_at=now - timedelta(days=60),
            ),
            ContributionRecord(
                actor_type=ActorType.SUPPLIER,
                actor_id="sup-tintura",
                supplier_role=SupplierRole.DYEING,
                sections=["certificates", "chemical_compliance"],
                payload_sha256=_HASH_C,
                created_at=now - timedelta(days=40),
            ),
            ContributionRecord(
                actor_type=ActorType.SYSTEM,
                actor_id="passready",
                sections=["status"],
                payload_sha256=_HASH_D,
                created_at=now - timedelta(days=30),
                note="published after completeness check",
            ),
        ],
        created_at=now - timedelta(days=90),
        updated_at=now - timedelta(days=30),
        published_at=now - timedelta(days=30),
    )


def _tee_batch_passport(model_level: DigitalProductPassport) -> DigitalProductPassport:
    """Batch-level passport: same product, plus the batch test report of the dye lot."""
    batch_report = Certificate(
        certificate_id="cert-testreport-lot2026a",
        type=CertificateType.TEST_REPORT,
        issuer="Hohenstein",
        number="TR-2026-0417",
        holder_supplier_id="sup-tintura",
        scope="Batch LOT2026A: formaldehyde, pH, azo dyes",
        url=HttpUrl("https://certificates.example/reports/TR-2026-0417"),
        valid_from=date(2026, 4, 17),
    )
    candidate = model_level.model_copy(
        update={
            "identifier": DppIdentifier(
                gtin=DEMO_GTIN_TEE,
                batch=DEMO_BATCH_TEE,
                dpp_id="urn:uuid:3d3b0a7e-0001-4c1f-9c4e-000000000002",
            ),
            "certificates": [*model_level.certificates, batch_report],
        }
    )
    return DigitalProductPassport.model_validate(candidate.model_dump())


def _jacket_passport() -> DigitalProductPassport:
    now = utcnow()
    return DigitalProductPassport(
        identifier=DppIdentifier(
            gtin=DEMO_GTIN_JACKET, dpp_id="urn:uuid:3d3b0a7e-0002-4c1f-9c4e-000000000001"
        ),
        status=DppStatus.PENDING_SUPPLIER_DATA,
        version=1,
        product=ProductInfo(
            name="Nordlicht Denim Jacket",
            description="Unlined denim jacket, 12 oz indigo denim.",
            category=TextileCategory.JACKET,
            taric_code="62033290",
            country_of_origin="TR",
            color="Indigo",
            size_range="S-XL",
            season="AW26",
            weight_g=650.0,
        ),
        economic_operator=BRAND,
        suppliers=[
            Supplier(
                supplier_id=DEMO_SUPPLIER_WEAVING_ID,
                name="Ege Denim Tekstil AS",
                role=SupplierRole.WEAVING,
                tier=2,
                country="TR",
                contact_email="export@egedenim.example.org",
            ),
            Supplier(
                supplier_id=DEMO_SUPPLIER_DYEING_ID,
                name="Mavi Boya Sanayi AS",
                role=SupplierRole.DYEING,
                tier=2,
                country="TR",
                contact_email="kalite@maviboya.example.org",
            ),
        ],
        care_and_durability=CareAndDurability(
            care_symbols=[
                CareSymbol.WASH_30,
                CareSymbol.NO_BLEACH,
                CareSymbol.NO_TUMBLE_DRY,
                CareSymbol.IRON_MEDIUM,
                CareSymbol.NO_DRY_CLEAN,
            ],
            care_text="Wash rarely, inside out, cold.",
        ),
        contributions=[
            ContributionRecord(
                actor_type=ActorType.BRAND,
                actor_id="brand",
                sections=["passport_created"],
                payload_sha256=_HASH_A,
                created_at=now - timedelta(days=5),
            )
        ],
        created_at=now - timedelta(days=5),
        updated_at=now - timedelta(days=5),
    )


def seed_demo_data(repository: DppRepository, token_ttl_days: int = 30) -> None:
    tee = _tee_passport()
    repository.save(tee)
    repository.save(_tee_batch_passport(tee))
    jacket = repository.save(_jacket_passport())

    now = utcnow()
    for token, supplier_id, role in (
        (DEMO_TOKEN_WEAVING, DEMO_SUPPLIER_WEAVING_ID, SupplierRole.WEAVING),
        (DEMO_TOKEN_DYEING, DEMO_SUPPLIER_DYEING_ID, SupplierRole.DYEING),
    ):
        repository.save_invitation(
            SupplierInvitation(
                token=token,
                gtin=jacket.identifier.gtin,
                supplier_id=supplier_id,
                supplier_role=role,
                allowed_sections=set(ROLE_DEFAULT_SECTIONS[role]),
                expires_at=now + timedelta(days=token_ttl_days),
                created_at=now,
            )
        )
