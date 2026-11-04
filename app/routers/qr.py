"""QR codes for labels: the data carrier that links the physical product to its passport."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Query, Request, Response

from app.core.deps import get_settings
from app.core.gs1 import build_digital_link, normalize_gtin
from app.services.qr import QR_MEDIA_TYPES, QrFormat, render_qr

router = APIRouter(prefix="/api/qr", tags=["GS1 Digital Link Resolver"])

FormatParam = Annotated[QrFormat, Query(alias="format", description="svg (default) or png")]
ScaleParam = Annotated[int | None, Query(ge=1, le=40, description="Module size in pixels")]
DownloadParam = Annotated[bool, Query(description="Send as attachment instead of inline")]

RESPONSES: dict[int | str, dict[str, Any]] = {
    200: {"content": {"image/svg+xml": {}, "image/png": {}}, "description": "QR code image"},
    400: {"description": "Invalid GTIN, batch or serial"},
}


def _qr_response(
    request: Request,
    gtin: str,
    batch: str | None,
    serial: str | None,
    fmt: QrFormat,
    scale: int | None,
    download: bool,
) -> Response:
    settings = get_settings(request)
    gtin14 = normalize_gtin(gtin)
    url = build_digital_link(settings.resolver_base_url, gtin14, batch, serial)
    body = render_qr(url, fmt, scale)
    name = "-".join(part for part in ("dpp", gtin14, batch, serial) if part)
    disposition: Literal["attachment", "inline"] = "attachment" if download else "inline"
    return Response(
        content=body,
        media_type=QR_MEDIA_TYPES[fmt],
        headers={
            "Content-Disposition": f'{disposition}; filename="{name}.{fmt}"',
            "Cache-Control": "public, max-age=86400",
            "X-Digital-Link": url,
        },
    )


@router.get("/01/{gtin}", responses=RESPONSES, summary="QR code for a model-level passport")
async def qr_gtin(
    request: Request,
    gtin: str,
    fmt: FormatParam = "svg",
    scale: ScaleParam = None,
    download: DownloadParam = False,
) -> Response:
    return _qr_response(request, gtin, None, None, fmt, scale, download)


@router.get(
    "/01/{gtin}/10/{batch}", responses=RESPONSES, summary="QR code for a batch-level passport"
)
async def qr_gtin_batch(
    request: Request,
    gtin: str,
    batch: str,
    fmt: FormatParam = "svg",
    scale: ScaleParam = None,
    download: DownloadParam = False,
) -> Response:
    return _qr_response(request, gtin, batch, None, fmt, scale, download)


@router.get(
    "/01/{gtin}/21/{serial}", responses=RESPONSES, summary="QR code for an item-level passport"
)
async def qr_gtin_serial(
    request: Request,
    gtin: str,
    serial: str,
    fmt: FormatParam = "svg",
    scale: ScaleParam = None,
    download: DownloadParam = False,
) -> Response:
    return _qr_response(request, gtin, None, serial, fmt, scale, download)


@router.get(
    "/01/{gtin}/10/{batch}/21/{serial}",
    responses=RESPONSES,
    summary="QR code for an item in a batch",
)
async def qr_gtin_batch_serial(
    request: Request,
    gtin: str,
    batch: str,
    serial: str,
    fmt: FormatParam = "svg",
    scale: ScaleParam = None,
    download: DownloadParam = False,
) -> Response:
    return _qr_response(request, gtin, batch, serial, fmt, scale, download)
