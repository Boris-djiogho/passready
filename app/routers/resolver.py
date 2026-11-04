"""GS1 Digital Link resolver endpoints (Component B).

``GET /01/{gtin}`` with optional ``/10/{batch}`` and ``/21/{serial}`` key qualifiers.
The same URL serves every role; the ``role`` query parameter or ``X-DPP-Role`` header selects
the read model (role-based routing). Content negotiation: JSON by default, JSON-LD on request,
linkset via ``linkType=linkset``, browser redirect when a landing page is configured.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse

from app.core.deps import RoleContext, get_repository, get_settings, resolve_role
from app.core.gs1 import build_digital_link, normalize_gtin
from app.models.common import Role
from app.models.views import PassportView
from app.services.jsonld import JSONLD_MEDIA_TYPE, to_jsonld
from app.services.resolver import ResolverService

router = APIRouter(tags=["GS1 Digital Link Resolver"])

LINKSET_MEDIA_TYPE = "application/linkset+json"

LinkTypeParam = Annotated[
    str | None,
    Query(
        alias="linkType",
        description="GS1 link type (e.g. gs1:pip). 'linkset' or 'all' returns every link.",
    ),
]
FormatParam = Annotated[
    str | None,
    Query(alias="format", pattern="^(json|jsonld)$", description="Force json or jsonld output"),
]

RESPONSES: dict[int | str, dict[str, Any]] = {
    200: {"description": "Role-specific passport view (consumer | recycler | authority)"},
    307: {"description": "Browser redirect to the landing page (only when configured)"},
    400: {"description": "Invalid GTIN, batch or serial"},
    403: {"description": "Role requires credentials"},
    404: {"description": "No published passport for this identifier"},
}


def _service(request: Request) -> ResolverService:
    return ResolverService(get_repository(request), get_settings(request))


def _respond(
    request: Request,
    response: Response,
    gtin: str,
    batch: str | None,
    serial: str | None,
    ctx: RoleContext,
    link_type: str | None,
    fmt: str | None,
) -> Any:
    settings = get_settings(request)
    service = _service(request)
    accept = request.headers.get("accept", "")
    gtin14 = normalize_gtin(gtin)

    if (link_type or "").lower() in {"linkset", "all"} or LINKSET_MEDIA_TYPE in accept:
        return JSONResponse(service.linkset(gtin14, batch, serial), media_type=LINKSET_MEDIA_TYPE)

    resolution = service.resolve(gtin14, batch, serial, ctx.role)

    prefers_html = (
        "text/html" in accept
        and "application/json" not in accept
        and JSONLD_MEDIA_TYPE not in accept
    )
    if settings.landing_page_base_url and prefers_html and not ctx.explicit and fmt is None:
        target = build_digital_link(settings.landing_page_base_url, gtin14, batch, serial)
        return RedirectResponse(url=target, status_code=307)

    service.record_scan(resolution, ctx.role, link_type, request.headers.get("user-agent"))
    view = service.view(resolution, ctx.role)
    headers = {
        "X-DPP-Role": ctx.role.value,
        "X-DPP-Granularity": resolution.granularity.value,
        "X-DPP-Fallback": "true" if resolution.fallback else "false",
        "X-DPP-Version": str(resolution.passport.version),
        "Cache-Control": "no-store" if ctx.role is Role.AUTHORITY else "public, max-age=300",
    }
    if fmt == "jsonld" or JSONLD_MEDIA_TYPE in accept:
        return JSONResponse(to_jsonld(view), media_type=JSONLD_MEDIA_TYPE, headers=headers)
    for name, value in headers.items():
        response.headers[name] = value
    return view


@router.get(
    "/01/{gtin}",
    response_model=PassportView,
    responses=RESPONSES,
    summary="Resolve a model-level passport (GTIN only)",
)
async def resolve_gtin(
    request: Request,
    response: Response,
    gtin: str,
    ctx: RoleContext = Depends(resolve_role),
    link_type: LinkTypeParam = None,
    fmt: FormatParam = None,
) -> Any:
    return _respond(request, response, gtin, None, None, ctx, link_type, fmt)


@router.get(
    "/01/{gtin}/10/{batch}",
    response_model=PassportView,
    responses=RESPONSES,
    summary="Resolve a batch-level passport (GTIN + lot)",
)
async def resolve_gtin_batch(
    request: Request,
    response: Response,
    gtin: str,
    batch: str,
    ctx: RoleContext = Depends(resolve_role),
    link_type: LinkTypeParam = None,
    fmt: FormatParam = None,
) -> Any:
    return _respond(request, response, gtin, batch, None, ctx, link_type, fmt)


@router.get(
    "/01/{gtin}/21/{serial}",
    response_model=PassportView,
    responses=RESPONSES,
    summary="Resolve an item-level passport (GTIN + serial)",
)
async def resolve_gtin_serial(
    request: Request,
    response: Response,
    gtin: str,
    serial: str,
    ctx: RoleContext = Depends(resolve_role),
    link_type: LinkTypeParam = None,
    fmt: FormatParam = None,
) -> Any:
    return _respond(request, response, gtin, None, serial, ctx, link_type, fmt)


@router.get(
    "/01/{gtin}/10/{batch}/21/{serial}",
    response_model=PassportView,
    responses=RESPONSES,
    summary="Resolve an item-level passport (GTIN + lot + serial)",
)
async def resolve_gtin_batch_serial(
    request: Request,
    response: Response,
    gtin: str,
    batch: str,
    serial: str,
    ctx: RoleContext = Depends(resolve_role),
    link_type: LinkTypeParam = None,
    fmt: FormatParam = None,
) -> Any:
    return _respond(request, response, gtin, batch, serial, ctx, link_type, fmt)


@router.get(
    "/.well-known/gs1resolver",
    summary="Resolver description (GS1 Digital Link resolver conformance)",
)
async def resolver_description(request: Request) -> dict[str, Any]:
    return _service(request).description()
