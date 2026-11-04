"""Liveness and a small landing document."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from app.core.deps import get_settings

router = APIRouter(tags=["Meta"])


@router.get("/health", summary="Liveness probe")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/", summary="Service description", include_in_schema=False)
async def root(request: Request) -> dict[str, Any]:
    settings = get_settings(request)
    return {
        "service": settings.app_name,
        "docs": "/docs",
        "resolver": "/01/{gtin}[/10/{batch}][/21/{serial}]",
        "resolver_description": "/.well-known/gs1resolver",
        "brand_api": "/api/dpp",
        "supplier_api": "/api/dpp/{gtin}/supplier-update",
    }
