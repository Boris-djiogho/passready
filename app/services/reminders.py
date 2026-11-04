"""Supplier reminders: compose the message, hand it to a notifier, record the attempt.

The MVP ships an outbox notifier (messages are stored, not delivered) so the flow, texts and
audit trail are real while e-mail delivery (SMTP or a provider) is a later plug-in.
"""

from __future__ import annotations

from datetime import datetime
from typing import Protocol

from app.core.config import Settings
from app.core.errors import ConflictError, PassportNotFoundError
from app.models.actors import Supplier, SupplierDataStatus, SupplierRole
from app.models.brand import OutboxMessage, ReminderResponse, SupplierStatus
from app.models.common import utcnow
from app.models.passport import ActorType, ContributionRecord, DigitalProductPassport
from app.models.supplier import SupplierInvitation
from app.repositories.base import DppRepository
from app.services.completeness import missing_for_role
from app.services.passport import PassportService
from app.services.supplier_update import SupplierUpdateService, sha256_of

ROLE_LABELS_DE: dict[SupplierRole, str] = {
    SupplierRole.FIBER_PRODUCTION: "Faserherstellung",
    SupplierRole.SPINNING: "Spinnerei",
    SupplierRole.WEAVING: "Weberei",
    SupplierRole.KNITTING: "Strickerei",
    SupplierRole.DYEING: "Färberei",
    SupplierRole.FINISHING: "Ausrüstung",
    SupplierRole.GARMENT_MAKING: "Konfektion",
    SupplierRole.TRIM_SUPPLIER: "Zutatenlieferant",
}


class Notifier(Protocol):
    def send(self, message: OutboxMessage) -> OutboxMessage: ...


class OutboxNotifier:
    """Stores the message; nothing leaves the system. Swap for SMTP in production."""

    def __init__(self, repository: DppRepository) -> None:
        self._repository = repository

    def send(self, message: OutboxMessage) -> OutboxMessage:
        return self._repository.add_outbox(message)


def portal_link(settings: Settings, gtin: str, token: str) -> str:
    return f"{settings.portal_base_url.rstrip('/')}/supplier/{gtin}?token={token}"


def compose_reminder(
    passport: DigitalProductPassport,
    supplier: Supplier,
    link: str,
    valid_until: datetime,
    note: str | None,
) -> tuple[str, str]:
    brand = passport.economic_operator.name
    product = passport.product.name
    gaps = missing_for_role(passport, supplier.role)
    gap_lines = (
        "\n".join(f"- {gap.label_de or gap.label}" for gap in gaps) or "- Ihre Angaben zum Artikel"
    )
    subject = f"Produktpass {product}: Angaben aus Ihrem Betrieb fehlen noch"
    body = (
        f"Guten Tag {supplier.name},\n\n"
        f'{brand} erstellt den Digitalen Produktpass für "{product}" '
        f"(GTIN {passport.identifier.gtin}). Dafür fehlen noch Angaben aus Ihrem Betrieb "
        f"({ROLE_LABELS_DE[supplier.role]}):\n{gap_lines}\n\n"
        f"Bitte tragen Sie die Daten über diesen Link ein, ein Konto ist nicht nötig:\n{link}\n\n"
        f"Der Link ist bis {valid_until:%d.%m.%Y} gültig. Jede Übermittlung wird mit Zeitstempel "
        f"und Prüfsumme protokolliert.\n"
    )
    if note:
        body += f"\n{note}\n"
    body += f"\nVielen Dank\n{brand}\n"
    return subject, body


class ReminderService:
    def __init__(
        self, repository: DppRepository, settings: Settings, notifier: Notifier | None = None
    ) -> None:
        self._repository = repository
        self._settings = settings
        self._notifier: Notifier = notifier or OutboxNotifier(repository)
        self._passports = PassportService(repository, settings)
        self._invitations = SupplierUpdateService(repository, settings)

    def _open_invitation(self, gtin: str, supplier_id: str) -> SupplierInvitation | None:
        now = utcnow()
        candidates = [
            inv
            for inv in self._repository.list_invitations(gtin)
            if inv.supplier_id == supplier_id and not inv.revoked and inv.expires_at > now
        ]
        return max(candidates, key=lambda inv: inv.expires_at) if candidates else None

    def statuses(
        self, gtin: str, batch: str | None = None, serial: str | None = None
    ) -> list[SupplierStatus]:
        passport = self._passports.get(gtin, batch, serial)
        now = utcnow()
        result: list[SupplierStatus] = []
        for supplier in passport.suppliers:
            invitation = self._open_invitation(passport.identifier.gtin, supplier.supplier_id)
            since = supplier.invited_at or passport.created_at
            last_contact = supplier.last_reminded_at or since
            pending = supplier.data_status is SupplierDataStatus.PENDING
            result.append(
                SupplierStatus(
                    supplier=supplier,
                    invitation_valid_until=invitation.expires_at if invitation else None,
                    portal_link=(
                        portal_link(self._settings, passport.identifier.gtin, invitation.token)
                        if invitation
                        else None
                    ),
                    days_waiting=max(0, (now - since).days) if pending else 0,
                    reminder_due=pending
                    and (now - last_contact).days >= self._settings.reminder_interval_days,
                )
            )
        return result

    def remind(
        self,
        gtin: str,
        supplier_id: str,
        note: str | None = None,
        batch: str | None = None,
        serial: str | None = None,
    ) -> ReminderResponse:
        passport = self._passports.get(gtin, batch, serial)
        supplier = passport.supplier_by_id(supplier_id)
        if supplier is None:
            raise PassportNotFoundError(f"supplier {supplier_id} is not attached to this passport")
        if supplier.data_status is not SupplierDataStatus.PENDING:
            raise ConflictError(f"{supplier.name} has already delivered its data")

        invitation = self._open_invitation(passport.identifier.gtin, supplier_id)
        if invitation is None:
            invitation = self._invitations.invite(passport, supplier)
        link = portal_link(self._settings, passport.identifier.gtin, invitation.token)
        subject, body = compose_reminder(passport, supplier, link, invitation.expires_at, note)

        warnings: list[str] = []
        if not supplier.contact_email:
            warnings.append("Keine E-Mail-Adresse hinterlegt; Link bitte auf anderem Weg senden.")
        if self._notifier.__class__ is OutboxNotifier:
            warnings.append("MVP: Die Nachricht wurde im Postausgang abgelegt, nicht versendet.")

        message = self._notifier.send(
            OutboxMessage(
                gtin=passport.identifier.gtin,
                supplier_id=supplier_id,
                to=supplier.contact_email,
                subject=subject,
                body=body,
            )
        )

        now = utcnow()
        updated_supplier = supplier.model_copy(
            update={
                "invited_at": supplier.invited_at or now,
                "last_reminded_at": now,
                "reminder_count": supplier.reminder_count + 1,
            }
        )
        suppliers = [
            updated_supplier if s.supplier_id == supplier_id else s for s in passport.suppliers
        ]
        candidate = passport.model_copy(
            update={
                "suppliers": suppliers,
                "version": passport.version + 1,
                "updated_at": now,
                "contributions": [
                    *passport.contributions,
                    ContributionRecord(
                        actor_type=ActorType.SYSTEM,
                        actor_id="passready",
                        sections=["suppliers"],
                        payload_sha256=sha256_of(f"{message.message_id}:{subject}"),
                        created_at=now,
                        note=f"reminder to {supplier.name} ({message.delivery})",
                    ),
                ],
            }
        )
        self._repository.save(DigitalProductPassport.model_validate(candidate.model_dump()))
        return ReminderResponse(
            supplier_id=supplier_id,
            supplier_name=supplier.name,
            message=message,
            portal_link=link,
            reminder_count=updated_supplier.reminder_count,
            reminded_at=now,
            warnings=warnings,
        )

    def outbox(self, gtin: str) -> list[OutboxMessage]:
        return self._repository.list_outbox(gtin)
