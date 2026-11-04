"""Brand-side passport authoring: create, read, invite suppliers, publish, scan statistics."""

from __future__ import annotations

from collections import Counter

from app.core.config import Settings
from app.core.errors import ConflictError, PassportNotFoundError, PublishBlockedError
from app.core.gs1 import normalize_gtin, validate_ai_value
from app.models.actors import Supplier
from app.models.brand import CreatePassportRequest, SupplierInviteRequest, SupplierInviteResponse
from app.models.common import utcnow
from app.models.completeness import CompletenessReport
from app.models.passport import (
    ActorType,
    ContributionRecord,
    DigitalProductPassport,
    DppStatus,
    PassportSummary,
)
from app.models.scan import FREE_ROLES, ScanSummary
from app.repositories.base import DppRepository
from app.services.completeness import assess
from app.services.supplier_update import SupplierUpdateService, sha256_of


class PassportService:
    def __init__(self, repository: DppRepository, settings: Settings) -> None:
        self._repository = repository
        self._settings = settings
        self._suppliers = SupplierUpdateService(repository, settings)

    def create(
        self, request: CreatePassportRequest, actor_id: str = "brand"
    ) -> DigitalProductPassport:
        key = request.identifier.key
        if self._repository.get(*key) is not None:
            raise ConflictError(
                f"a passport for GTIN {key[0]} (batch={key[1]}, serial={key[2]}) already exists"
            )
        now = utcnow()
        passport = DigitalProductPassport(
            identifier=request.identifier,
            status=DppStatus.PENDING_SUPPLIER_DATA if request.suppliers else DppStatus.DRAFT,
            product=request.product,
            economic_operator=request.economic_operator,
            suppliers=request.suppliers,
            fiber_compositions=request.fiber_compositions,
            environmental_footprint=request.environmental_footprint,
            chemical_compliance=request.chemical_compliance,
            certificates=request.certificates,
            care_and_durability=request.care_and_durability,
            end_of_life=request.end_of_life,
            contributions=[
                ContributionRecord(
                    actor_type=ActorType.BRAND,
                    actor_id=actor_id,
                    sections=["passport_created"],
                    payload_sha256=sha256_of(request.model_dump_json()),
                    created_at=now,
                )
            ],
            created_at=now,
            updated_at=now,
        )
        return self._repository.save(passport)

    def get(
        self, gtin: str, batch: str | None = None, serial: str | None = None
    ) -> DigitalProductPassport:
        gtin14 = normalize_gtin(gtin)
        if batch is not None:
            validate_ai_value(batch, "10")
        if serial is not None:
            validate_ai_value(serial, "21")
        passport = self._repository.get(gtin14, batch, serial)
        if passport is None:
            raise PassportNotFoundError(
                f"no passport for GTIN {gtin14} (batch={batch}, serial={serial})"
            )
        return passport

    def list_summaries(self) -> list[PassportSummary]:
        return [
            PassportSummary(
                gtin=p.identifier.gtin,
                batch=p.identifier.batch,
                serial=p.identifier.serial,
                dpp_id=p.identifier.dpp_id,
                product_name=p.product.name,
                status=p.status,
                version=p.version,
                updated_at=p.updated_at,
            )
            for p in sorted(
                self._repository.list_all(),
                key=lambda p: (
                    p.identifier.gtin,
                    p.identifier.batch or "",
                    p.identifier.serial or "",
                ),
            )
        ]

    def completeness(
        self, gtin: str, batch: str | None = None, serial: str | None = None
    ) -> CompletenessReport:
        return assess(self.get(gtin, batch, serial))

    def invite_supplier(self, gtin: str, request: SupplierInviteRequest) -> SupplierInviteResponse:
        passport = self.get(gtin, request.batch, request.serial)
        supplier = self._ensure_supplier(passport, request)
        if passport.supplier_by_id(supplier.supplier_id) is None:
            passport = passport.model_copy(
                update={
                    "suppliers": [*passport.suppliers, supplier],
                    "status": (
                        DppStatus.PENDING_SUPPLIER_DATA
                        if passport.status is DppStatus.DRAFT
                        else passport.status
                    ),
                    "updated_at": utcnow(),
                }
            )
            passport = self._repository.save(
                DigitalProductPassport.model_validate(passport.model_dump())
            )
        invitation = self._suppliers.invite(passport, supplier, request.allowed_sections)
        path = f"/api/dpp/{passport.identifier.gtin}/supplier-update"
        return SupplierInviteResponse(
            supplier_id=supplier.supplier_id,
            supplier_role=supplier.role,
            token=invitation.token,
            allowed_sections=sorted(invitation.allowed_sections, key=lambda s: s.value),
            expires_at=invitation.expires_at,
            update_endpoint=f"POST {path}",
            context_endpoint=f"GET {path}/context",
        )

    def publish(
        self, gtin: str, batch: str | None = None, serial: str | None = None
    ) -> DigitalProductPassport:
        passport = self.get(gtin, batch, serial)
        if passport.status is DppStatus.WITHDRAWN:
            raise PublishBlockedError("a withdrawn passport cannot be re-published")
        report = assess(passport)
        if not report.complete:
            raise PublishBlockedError(
                "passport is incomplete; collect the missing data before publishing",
                extra={"missing": [m.model_dump(mode="json") for m in report.missing]},
            )
        now = utcnow()
        published = passport.model_copy(
            update={
                "status": DppStatus.PUBLISHED,
                "published_at": passport.published_at or now,
                "updated_at": now,
                "version": passport.version + 1,
                "contributions": [
                    *passport.contributions,
                    ContributionRecord(
                        actor_type=ActorType.SYSTEM,
                        actor_id="passready",
                        sections=["status"],
                        payload_sha256=sha256_of(f"publish:{passport.identifier.dpp_id}:{now}"),
                        created_at=now,
                        note="published after completeness check",
                    ),
                ],
            }
        )
        return self._repository.save(published)

    def scan_summary(self, gtin: str) -> ScanSummary:
        gtin14 = normalize_gtin(gtin)
        events = self._repository.list_scans(gtin14)
        by_role = Counter(e.role.value for e in events)
        return ScanSummary(
            gtin=gtin14,
            total=len(events),
            billable=sum(1 for e in events if e.billable),
            by_role=dict(sorted(by_role.items())),
            free_roles=sorted(FREE_ROLES, key=lambda r: r.value),
        )

    @staticmethod
    def _ensure_supplier(
        passport: DigitalProductPassport, request: SupplierInviteRequest
    ) -> Supplier:
        if request.supplier is not None:
            return request.supplier
        if request.supplier_id is None:
            raise ConflictError("either supplier_id or a supplier object is required")
        supplier = passport.supplier_by_id(request.supplier_id)
        if supplier is None:
            raise PassportNotFoundError(
                f"supplier {request.supplier_id} is not attached to this passport"
            )
        return supplier
