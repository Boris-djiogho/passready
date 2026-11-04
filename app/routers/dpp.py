"""Brand API: author passports, invite suppliers, publish, inspect scans."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from app.core.deps import get_repository, get_settings, require_brand_key
from app.core.errors import ConflictError
from app.models.brand import CreatePassportRequest, SupplierInviteRequest, SupplierInviteResponse
from app.models.completeness import CompletenessReport
from app.models.passport import DigitalProductPassport, PassportSummary
from app.models.scan import ScanSummary
from app.services.chemistry import ChemistryScreeningResult, screen
from app.services.passport import PassportService

router = APIRouter(
    prefix="/api/dpp",
    tags=["Brand: Passport Authoring"],
    dependencies=[Depends(require_brand_key)],
)

BatchQuery = Annotated[str | None, Query(description="Batch / lot (GS1 AI 10)")]
SerialQuery = Annotated[str | None, Query(description="Serial (GS1 AI 21)")]


def _service(request: Request) -> PassportService:
    return PassportService(get_repository(request), get_settings(request))


@router.get("", response_model=list[PassportSummary], summary="List passports")
async def list_passports(request: Request) -> list[PassportSummary]:
    return _service(request).list_summaries()


@router.post(
    "",
    response_model=DigitalProductPassport,
    status_code=status.HTTP_201_CREATED,
    summary="Create a passport draft",
)
async def create_passport(
    request: Request, payload: CreatePassportRequest
) -> DigitalProductPassport:
    return _service(request).create(payload)


@router.get("/{gtin}", response_model=DigitalProductPassport, summary="Read the full passport")
async def get_passport(
    request: Request, gtin: str, batch: BatchQuery = None, serial: SerialQuery = None
) -> DigitalProductPassport:
    return _service(request).get(gtin, batch, serial)


@router.get(
    "/{gtin}/completeness",
    response_model=CompletenessReport,
    summary="Gap report against the mandatory textile data set",
)
async def completeness(
    request: Request, gtin: str, batch: BatchQuery = None, serial: SerialQuery = None
) -> CompletenessReport:
    return _service(request).completeness(gtin, batch, serial)


@router.get(
    "/{gtin}/chemistry-check",
    response_model=ChemistryScreeningResult,
    summary="Screen declared substances against REACH SVHC / PFAS reference lists",
)
async def chemistry_check(
    request: Request, gtin: str, batch: BatchQuery = None, serial: SerialQuery = None
) -> ChemistryScreeningResult:
    passport = _service(request).get(gtin, batch, serial)
    if passport.chemical_compliance is None:
        raise ConflictError(
            "no chemical compliance data yet; wait for the dyeing/finishing supplier"
        )
    return screen(passport.chemical_compliance)


@router.post(
    "/{gtin}/suppliers",
    response_model=SupplierInviteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Attach a supplier and issue its invitation token",
)
async def invite_supplier(
    request: Request, gtin: str, payload: SupplierInviteRequest
) -> SupplierInviteResponse:
    return _service(request).invite_supplier(gtin, payload)


@router.post(
    "/{gtin}/publish",
    response_model=DigitalProductPassport,
    summary="Publish (blocked with 409 while mandatory data is missing)",
)
async def publish(
    request: Request, gtin: str, batch: BatchQuery = None, serial: SerialQuery = None
) -> DigitalProductPassport:
    return _service(request).publish(gtin, batch, serial)


@router.get("/{gtin}/scans", response_model=ScanSummary, summary="Scan statistics (pay-per-scan)")
async def scans(request: Request, gtin: str) -> ScanSummary:
    return _service(request).scan_summary(gtin)
