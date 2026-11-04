"""Build the role-specific read model from a passport (role-based routing, prEN 18239)."""

from __future__ import annotations

from datetime import date

from app.models.common import Role
from app.models.identifiers import Granularity
from app.models.passport import DigitalProductPassport
from app.models.views import (
    AuthorityPassportView,
    ConsumerBrand,
    ConsumerCare,
    ConsumerChemistry,
    ConsumerComposition,
    ConsumerEndOfLife,
    ConsumerEnvironment,
    ConsumerFiber,
    ConsumerPassportView,
    ConsumerProduct,
    PublicCertificate,
    PublicIdentifier,
    RecyclerPassportView,
    RecyclerProduct,
    ResolutionMeta,
)
from app.services.completeness import assess

AnyView = ConsumerPassportView | RecyclerPassportView | AuthorityPassportView


def build_view(
    passport: DigitalProductPassport,
    role: Role,
    *,
    base_url: str,
    requested_batch: str | None,
    requested_serial: str | None,
    fallback: bool,
) -> AnyView:
    identifier = PublicIdentifier(
        gtin=passport.identifier.gtin,
        batch=passport.identifier.batch,
        serial=passport.identifier.serial,
        granularity=passport.identifier.granularity,
        digital_link=passport.identifier.digital_link(base_url),
    )
    meta = ResolutionMeta(
        requested_batch=requested_batch,
        requested_serial=requested_serial,
        served_granularity=passport.identifier.granularity,
        fallback=fallback,
    )
    if role is Role.AUTHORITY:
        return AuthorityPassportView(
            identifier=identifier,
            resolution=meta,
            passport=passport,
            completeness=assess(passport),
        )

    today = date.today()
    public_certificates = [
        PublicCertificate(type=c.type, issuer=c.issuer, url=c.url, valid_until=c.valid_until)
        for c in passport.certificates
        if c.public and c.is_valid_on(today)
    ]
    chemistry = passport.chemical_compliance

    if role is Role.RECYCLER:
        return RecyclerPassportView(
            identifier=identifier,
            resolution=meta,
            status=passport.status,
            version=passport.version,
            product=RecyclerProduct(
                name=passport.product.name,
                category=passport.product.category,
                weight_g=passport.product.weight_g,
                mono_material=passport.end_of_life.mono_material if passport.end_of_life else None,
            ),
            brand_name=passport.economic_operator.name,
            compositions=passport.fiber_compositions,
            substances_of_concern=chemistry.substances_of_concern if chemistry else [],
            pfas_free=chemistry.pfas_free if chemistry else None,
            end_of_life=passport.end_of_life,
            certificates=public_certificates,
        )

    care = passport.care_and_durability
    footprint = passport.environmental_footprint
    eol = passport.end_of_life
    return ConsumerPassportView(
        identifier=identifier,
        resolution=meta,
        status=passport.status,
        version=passport.version,
        published_at=passport.published_at,
        product=ConsumerProduct(
            name=passport.product.name,
            description=passport.product.description,
            category=passport.product.category,
            country_of_origin=passport.product.country_of_origin,
            color=passport.product.color,
            image_urls=passport.product.image_urls,
        ),
        brand=ConsumerBrand(
            name=passport.economic_operator.name, website=passport.economic_operator.website
        ),
        composition=[
            ConsumerComposition(
                component=comp.component,
                fibers=[
                    ConsumerFiber(
                        fiber=f.fiber,
                        label=f.label,
                        percentage=f.percentage,
                        recycled_percentage=f.recycled_percentage,
                    )
                    for f in comp.fibers
                ],
                total_recycled_percentage=comp.total_recycled_percentage(),
            )
            for comp in passport.fiber_compositions
        ],
        care=ConsumerCare(
            care_symbols=care.care_symbols,
            care_text=care.care_text,
            repair_instructions_url=care.repair.instructions_url if care.repair else None,
            spare_parts_available=care.repair.spare_parts_available if care.repair else None,
        )
        if care
        else None,
        environment=ConsumerEnvironment(
            pcf_kg_co2e=footprint.pcf_kg_co2e,
            method=footprint.method,
            boundary=footprint.boundary,
            verified=footprint.verified,
        )
        if footprint
        else None,
        chemistry=ConsumerChemistry(
            contains_substances_of_concern=bool(chemistry.substances_of_concern),
            substances=[s.name for s in chemistry.substances_of_concern],
            pfas_free=chemistry.pfas_free,
        )
        if chemistry
        else None,
        certificates=public_certificates,
        end_of_life=ConsumerEndOfLife(
            recyclable=eol.recyclable,
            recycling_notes=eol.recycling_notes,
            take_back_program_url=eol.take_back_program_url,
        )
        if eol
        else None,
    )


def granularity_of(passport: DigitalProductPassport) -> Granularity:
    return passport.identifier.granularity
