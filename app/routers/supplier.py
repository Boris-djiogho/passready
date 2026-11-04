"""Supplier portal API (Component C): suppliers append data to an unfinished passport."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, Query, Request, status

from app.core.deps import get_repository, get_settings
from app.models.supplier import SupplierContext, SupplierUpdateRequest, SupplierUpdateResponse
from app.services.supplier_update import SupplierUpdateService

router = APIRouter(prefix="/api/dpp", tags=["Supplier Portal"])

TokenHeader = Annotated[
    str | None, Header(alias="X-Supplier-Token", description="Invitation token from the brand")
]
TokenQuery = Annotated[str | None, Query(alias="token", description="Alternative to the header")]


def _service(request: Request) -> SupplierUpdateService:
    return SupplierUpdateService(get_repository(request), get_settings(request))


@router.get(
    "/{gtin}/supplier-update/context",
    response_model=SupplierContext,
    summary="What this supplier may fill in and what is still missing",
)
async def supplier_context(
    request: Request,
    gtin: str,
    x_supplier_token: TokenHeader = None,
    token: TokenQuery = None,
) -> SupplierContext:
    return _service(request).context(gtin, x_supplier_token or token)


@router.post(
    "/{gtin}/supplier-update",
    response_model=SupplierUpdateResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Append supplier data (fibre composition, chemistry, certificates) to a passport",
    responses={
        401: {"description": "Token missing, unknown, revoked or expired"},
        403: {"description": "Token not valid for this GTIN or section not allowed for the role"},
        404: {"description": "Passport not found"},
        422: {"description": "Payload violates the DPP schema"},
    },
)
async def supplier_update(
    request: Request,
    gtin: str,
    payload: SupplierUpdateRequest,
    x_supplier_token: TokenHeader = None,
    token: TokenQuery = None,
) -> SupplierUpdateResponse:
    return _service(request).apply(gtin, x_supplier_token or token, payload)
