"""Supplier portal: validate the invitation token and merge a partial update into the passport."""

from __future__ import annotations

import hashlib
from datetime import timedelta

from app.core.config import Settings
from app.core.errors import (
    ForbiddenError,
    InvalidSupplierTokenError,
    PassportNotFoundError,
    SectionNotAllowedError,
)
from app.core.gs1 import normalize_gtin
from app.models.actors import Supplier, SupplierDataStatus, SupplierRole
from app.models.certificates import Certificate
from app.models.common import utcnow
from app.models.completeness import CompletenessReport
from app.models.materials import FiberComposition
from app.models.passport import ActorType, ContributionRecord, DigitalProductPassport, DppStatus
from app.models.supplier import (
    ROLE_DEFAULT_SECTIONS,
    DppSection,
    SupplierContext,
    SupplierInvitation,
    SupplierUpdateRequest,
    SupplierUpdateResponse,
)
from app.repositories.base import DppRepository
from app.services.completeness import assess, missing_for_role


def sha256_of(payload: str) -> str:
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class SupplierUpdateService:
    def __init__(self, repository: DppRepository, settings: Settings) -> None:
        self._repository = repository
        self._settings = settings

    # --- invitations -------------------------------------------------------------------

    def invite(
        self,
        passport: DigitalProductPassport,
        supplier: Supplier,
        allowed_sections: set[DppSection] | None = None,
    ) -> SupplierInvitation:
        now = utcnow()
        invitation = SupplierInvitation(
            gtin=passport.identifier.gtin,
            batch=passport.identifier.batch,
            serial=passport.identifier.serial,
            supplier_id=supplier.supplier_id,
            supplier_role=supplier.role,
            allowed_sections=set(allowed_sections or ROLE_DEFAULT_SECTIONS[supplier.role]),
            expires_at=now + timedelta(days=self._settings.supplier_token_ttl_days),
            created_at=now,
        )
        return self._repository.save_invitation(invitation)

    def _authorise(self, gtin: str, token: str | None) -> SupplierInvitation:
        gtin14 = normalize_gtin(gtin)
        if not token:
            raise InvalidSupplierTokenError("supplier token missing (X-Supplier-Token header)")
        invitation = self._repository.get_invitation(token)
        if invitation is None or invitation.revoked:
            raise InvalidSupplierTokenError("unknown or revoked supplier token")
        if invitation.expires_at < utcnow():
            raise InvalidSupplierTokenError("supplier token expired; ask the brand for a new link")
        if invitation.gtin != gtin14:
            raise ForbiddenError("supplier token is not valid for this GTIN")
        return invitation

    def _passport_for(self, invitation: SupplierInvitation) -> DigitalProductPassport:
        passport = self._repository.get(invitation.gtin, invitation.batch, invitation.serial)
        if passport is None:
            raise PassportNotFoundError(f"passport for GTIN {invitation.gtin} no longer exists")
        return passport

    def context(self, gtin: str, token: str | None) -> SupplierContext:
        invitation = self._authorise(gtin, token)
        passport = self._passport_for(invitation)
        supplier = passport.supplier_by_id(invitation.supplier_id)
        if supplier is None:
            raise PassportNotFoundError("supplier is no longer attached to this passport")
        return SupplierContext(
            supplier=supplier,
            product_name=passport.product.name,
            gtin=passport.identifier.gtin,
            batch=passport.identifier.batch,
            serial=passport.identifier.serial,
            allowed_sections=sorted(invitation.allowed_sections, key=lambda s: s.value),
            missing_for_me=missing_for_role(passport, invitation.supplier_role),
            expires_at=invitation.expires_at,
        )

    # --- update ------------------------------------------------------------------------

    def apply(
        self, gtin: str, token: str | None, request: SupplierUpdateRequest
    ) -> SupplierUpdateResponse:
        invitation = self._authorise(gtin, token)
        requested = request.sections()
        disallowed = requested - invitation.allowed_sections
        if disallowed:
            raise SectionNotAllowedError(
                f"role '{invitation.supplier_role.value}' may not update: "
                f"{sorted(s.value for s in disallowed)}",
                extra={"allowed_sections": sorted(s.value for s in invitation.allowed_sections)},
            )
        passport = self._passport_for(invitation)
        now = utcnow()

        certificates = _merge_certificates(
            passport.certificates, request.certificates, invitation.supplier_id
        )
        compositions = _merge_compositions(passport.fiber_compositions, request.fiber_compositions)
        chemical = passport.chemical_compliance
        if request.chemical_compliance is not None:
            chemical = request.chemical_compliance.model_copy(
                update={"declared_by_supplier_id": invitation.supplier_id, "declared_at": now}
            )
        footprint = request.environmental_footprint or passport.environmental_footprint
        suppliers = _patch_supplier(passport.suppliers, invitation.supplier_id, request)

        contribution = ContributionRecord(
            actor_type=ActorType.SUPPLIER,
            actor_id=invitation.supplier_id,
            supplier_role=invitation.supplier_role,
            sections=sorted(s.value for s in requested),
            payload_sha256=sha256_of(request.model_dump_json(exclude_none=True)),
            created_at=now,
            note=request.note,
        )
        candidate = passport.model_copy(
            update={
                "certificates": certificates,
                "fiber_compositions": compositions,
                "chemical_compliance": chemical,
                "environmental_footprint": footprint,
                "suppliers": suppliers,
                "contributions": [*passport.contributions, contribution],
                "version": passport.version + 1,
                "updated_at": now,
            }
        )
        # Re-validate the whole aggregate: cross-references (certificate ids, suppliers) and
        # composition sums are checked here, so a partial update can never corrupt a passport.
        validated = DigitalProductPassport.model_validate(candidate.model_dump())
        report = assess(validated)
        validated = validated.model_copy(update={"status": _next_status(validated.status, report)})
        saved = self._repository.save(validated)
        return SupplierUpdateResponse(
            gtin=saved.identifier.gtin,
            batch=saved.identifier.batch,
            serial=saved.identifier.serial,
            passport_version=saved.version,
            status=saved.status,
            sections_updated=sorted(requested, key=lambda s: s.value),
            contribution=contribution,
            missing_after_update=report.missing,
        )


def _next_status(current: DppStatus, report: CompletenessReport) -> DppStatus:
    if current in (DppStatus.PUBLISHED, DppStatus.WITHDRAWN):
        return current
    return DppStatus.IN_REVIEW if report.complete else DppStatus.PENDING_SUPPLIER_DATA


def _merge_certificates(
    existing: list[Certificate], incoming: list[Certificate] | None, supplier_id: str
) -> list[Certificate]:
    if not incoming:
        return list(existing)
    merged = list(existing)
    for certificate in incoming:
        certificate = certificate.model_copy(
            update={"holder_supplier_id": certificate.holder_supplier_id or supplier_id}
        )
        replaced = False
        for index, present in enumerate(merged):
            same_identity = present.certificate_id == certificate.certificate_id
            same_document = (
                certificate.number is not None
                and present.type == certificate.type
                and present.number == certificate.number
            )
            if same_identity or same_document:
                merged[index] = certificate
                replaced = True
                break
        if not replaced:
            merged.append(certificate)
    return merged


def _merge_compositions(
    existing: list[FiberComposition], incoming: list[FiberComposition] | None
) -> list[FiberComposition]:
    if incoming is None:
        return list(existing)
    by_component = {c.component: c for c in existing}
    for composition in incoming:
        by_component[composition.component] = composition
    return list(by_component.values())


def _patch_supplier(
    suppliers: list[Supplier], supplier_id: str, request: SupplierUpdateRequest
) -> list[Supplier]:
    patched: list[Supplier] = []
    for supplier in suppliers:
        if supplier.supplier_id != supplier_id:
            patched.append(supplier)
            continue
        changes: dict[str, object] = {"data_status": SupplierDataStatus.SUBMITTED}
        if request.supplier_details:
            changes.update(request.supplier_details.model_dump(exclude_none=True))
        patched.append(Supplier.model_validate({**supplier.model_dump(), **changes}))
    return patched


def default_sections_for(role: SupplierRole) -> set[DppSection]:
    return set(ROLE_DEFAULT_SECTIONS[role])
