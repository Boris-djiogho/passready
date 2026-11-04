"""GS1 Digital Link resolver: identifier lookup, role-based view selection, linkset, scans."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.config import Settings
from app.core.errors import PassportNotFoundError, PassportNotPublishedError
from app.core.gs1 import build_digital_link, normalize_gtin, validate_ai_value
from app.models.common import Role
from app.models.identifiers import Granularity
from app.models.passport import DigitalProductPassport, DppStatus
from app.models.scan import FREE_ROLES, ScanEvent
from app.models.views import LinkTarget
from app.repositories.base import DppRepository
from app.services.views import AnyView, build_view

GS1_VOC = "https://gs1.org/voc/"


@dataclass(frozen=True)
class Resolution:
    passport: DigitalProductPassport
    requested_batch: str | None
    requested_serial: str | None
    fallback: bool

    @property
    def granularity(self) -> Granularity:
        return self.passport.identifier.granularity


class ResolverService:
    def __init__(self, repository: DppRepository, settings: Settings) -> None:
        self._repository = repository
        self._settings = settings

    def resolve(self, gtin: str, batch: str | None, serial: str | None, role: Role) -> Resolution:
        gtin14 = normalize_gtin(gtin)
        if batch is not None:
            validate_ai_value(batch, "10")
        if serial is not None:
            validate_ai_value(serial, "21")

        found = self._repository.resolve(gtin14, batch, serial)
        if found is None:
            raise PassportNotFoundError(f"no digital product passport for GTIN {gtin14}")
        passport, fallback = found
        if role is not Role.AUTHORITY and passport.status is not DppStatus.PUBLISHED:
            raise PassportNotPublishedError(
                f"passport for GTIN {gtin14} exists but is not published (status: "
                f"{passport.status.value})"
            )
        return Resolution(
            passport=passport, requested_batch=batch, requested_serial=serial, fallback=fallback
        )

    def view(self, resolution: Resolution, role: Role) -> AnyView:
        return build_view(
            resolution.passport,
            role,
            base_url=self._settings.resolver_base_url,
            requested_batch=resolution.requested_batch,
            requested_serial=resolution.requested_serial,
            fallback=resolution.fallback,
        )

    def record_scan(
        self, resolution: Resolution, role: Role, link_type: str | None, user_agent: str | None
    ) -> ScanEvent:
        event = ScanEvent(
            gtin=resolution.passport.identifier.gtin,
            batch=resolution.requested_batch,
            serial=resolution.requested_serial,
            role=role,
            billable=role not in FREE_ROLES,
            link_type=link_type,
            user_agent=(user_agent or None) and (user_agent or "")[:300],
        )
        self._repository.add_scan(event)
        return event

    def linkset(self, gtin: str, batch: str | None, serial: str | None) -> dict[str, Any]:
        """Linkset per GS1 Digital Link resolver conventions (one anchor, typed links)."""
        anchor = build_digital_link(self._settings.resolver_base_url, gtin, batch, serial)
        landing = (
            build_digital_link(self._settings.landing_page_base_url, gtin, batch, serial)
            if self._settings.landing_page_base_url
            else f"{anchor}?role=consumer"
        )
        links: dict[str, list[LinkTarget]] = {
            f"{GS1_VOC}defaultLink": [
                LinkTarget(href=landing, title="Digitaler Produktpass", type="text/html")
            ],
            f"{GS1_VOC}pip": [
                LinkTarget(href=landing, title="Produktinformationen", type="text/html")
            ],
            f"{GS1_VOC}sustainabilityInfo": [
                LinkTarget(href=f"{anchor}?role=consumer", title="Nachhaltigkeit und Material")
            ],
            f"{GS1_VOC}recyclingInfo": [
                LinkTarget(href=f"{anchor}?role=recycler", title="Recycling und Demontage")
            ],
            f"{GS1_VOC}certificationInfo": [
                LinkTarget(href=f"{anchor}?role=consumer", title="Zertifikate")
            ],
        }
        entry: dict[str, Any] = {"anchor": anchor}
        for relation, targets in links.items():
            entry[relation] = [t.model_dump(mode="json") for t in targets]
        return {"linkset": [entry]}

    def description(self) -> dict[str, Any]:
        """Resolver description document served at /.well-known/gs1resolver."""
        return {
            "name": "PassReady GS1 Digital Link Resolver",
            "resolverRoot": self._settings.resolver_base_url,
            "supportedLinkType": [
                {"namespace": GS1_VOC, "prefix": "gs1", "profile": f"{GS1_VOC}?show=linktypes"}
            ],
            "supportedPrimaryKeys": ["01"],
            "supportedKeyQualifiers": {"01": ["10", "21"]},
            "supportedContextValues": [
                {"name": "role", "values": [r.value for r in Role]},
                {"name": "linkType", "values": ["linkset", "all"]},
                {"name": "format", "values": ["json", "jsonld"]},
            ],
            "linksetResponses": True,
        }
