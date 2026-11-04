"""In-memory repository.

Stores every passport as ``model_dump(mode="json")`` and re-validates on read. That is the
exact document a PostgreSQL JSONB column would hold, so the PostgreSQL implementation only
swaps the dict for a table (see db/schema.sql) without touching models or services.
"""

from __future__ import annotations

from typing import Any

from app.models.brand import OutboxMessage
from app.models.passport import DigitalProductPassport
from app.models.scan import ScanEvent
from app.models.supplier import SupplierInvitation
from app.repositories.base import PassportKey


class InMemoryDppRepository:
    def __init__(self) -> None:
        self._documents: dict[PassportKey, dict[str, Any]] = {}
        self._invitations: dict[str, dict[str, Any]] = {}
        self._scans: list[dict[str, Any]] = []
        self._outbox: list[dict[str, Any]] = []

    # --- passports -------------------------------------------------------------------

    def get(
        self, gtin: str, batch: str | None = None, serial: str | None = None
    ) -> DigitalProductPassport | None:
        document = self._documents.get((gtin, batch, serial))
        return DigitalProductPassport.model_validate(document) if document else None

    def resolve(
        self, gtin: str, batch: str | None, serial: str | None
    ) -> tuple[DigitalProductPassport, bool] | None:
        candidates: list[PassportKey] = []
        for key in ((gtin, batch, serial), (gtin, batch, None), (gtin, None, None)):
            if key not in candidates:
                candidates.append(key)
        for index, key in enumerate(candidates):
            document = self._documents.get(key)
            if document:
                return DigitalProductPassport.model_validate(document), index > 0
        return None

    def save(self, passport: DigitalProductPassport) -> DigitalProductPassport:
        self._documents[passport.identifier.key] = passport.model_dump(mode="json")
        return passport

    def list_all(self) -> list[DigitalProductPassport]:
        return [DigitalProductPassport.model_validate(d) for d in self._documents.values()]

    def list_by_gtin(self, gtin: str) -> list[DigitalProductPassport]:
        return [
            DigitalProductPassport.model_validate(d)
            for key, d in self._documents.items()
            if key[0] == gtin
        ]

    # --- supplier invitations ----------------------------------------------------------

    def save_invitation(self, invitation: SupplierInvitation) -> SupplierInvitation:
        self._invitations[invitation.token] = invitation.model_dump(mode="json")
        return invitation

    def get_invitation(self, token: str) -> SupplierInvitation | None:
        document = self._invitations.get(token)
        return SupplierInvitation.model_validate(document) if document else None

    def list_invitations(self, gtin: str) -> list[SupplierInvitation]:
        return [
            SupplierInvitation.model_validate(d)
            for d in self._invitations.values()
            if d["gtin"] == gtin
        ]

    # --- scans ---------------------------------------------------------------------------

    def add_scan(self, event: ScanEvent) -> None:
        self._scans.append(event.model_dump(mode="json"))

    def list_scans(self, gtin: str) -> list[ScanEvent]:
        return [ScanEvent.model_validate(d) for d in self._scans if d["gtin"] == gtin]

    # --- outbox (reminder messages that would be sent) -----------------------------------

    def add_outbox(self, message: OutboxMessage) -> OutboxMessage:
        self._outbox.append(message.model_dump(mode="json"))
        return message

    def list_outbox(self, gtin: str) -> list[OutboxMessage]:
        return [OutboxMessage.model_validate(d) for d in self._outbox if d["gtin"] == gtin]

    def clear(self) -> None:
        self._documents.clear()
        self._invitations.clear()
        self._scans.clear()
        self._outbox.clear()
