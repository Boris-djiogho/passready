"""Repository protocol. Implementations: ``memory`` (MVP), PostgreSQL/JSONB (db/schema.sql)."""

from __future__ import annotations

from typing import Protocol

from app.models.passport import DigitalProductPassport
from app.models.scan import ScanEvent
from app.models.supplier import SupplierInvitation

PassportKey = tuple[str, str | None, str | None]


class DppRepository(Protocol):
    def get(
        self, gtin: str, batch: str | None = None, serial: str | None = None
    ) -> DigitalProductPassport | None:
        """Exact match on (gtin, batch, serial)."""
        ...

    def resolve(
        self, gtin: str, batch: str | None, serial: str | None
    ) -> tuple[DigitalProductPassport, bool] | None:
        """Hierarchical lookup item -> batch -> model. Second value: fallback happened."""
        ...

    def save(self, passport: DigitalProductPassport) -> DigitalProductPassport: ...

    def list_all(self) -> list[DigitalProductPassport]: ...

    def list_by_gtin(self, gtin: str) -> list[DigitalProductPassport]: ...

    def save_invitation(self, invitation: SupplierInvitation) -> SupplierInvitation: ...

    def get_invitation(self, token: str) -> SupplierInvitation | None: ...

    def list_invitations(self, gtin: str) -> list[SupplierInvitation]: ...

    def add_scan(self, event: ScanEvent) -> None: ...

    def list_scans(self, gtin: str) -> list[ScanEvent]: ...

    def clear(self) -> None: ...
