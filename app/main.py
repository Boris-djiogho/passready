"""Application factory. ``uvicorn app.main:app --reload`` for development."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from app.core.config import Settings
from app.core.errors import PassReadyError
from app.repositories.base import DppRepository
from app.repositories.memory import InMemoryDppRepository
from app.routers import dpp, health, qr, resolver, supplier
from app.services.seed import seed_demo_data

DESCRIPTION = """
PassReady generates and serves Digital Product Passports (DPP) for small fashion brands.

* **Resolver** `/01/{gtin}[/10/{batch}][/21/{serial}]`: GS1 Digital Link with role-based
  routing (`?role=consumer|recycler|authority`).
* **Supplier portal** `/api/dpp/{gtin}/supplier-update`: weaving, dyeing and other suppliers
  append their data with an invitation token.
* **Brand API** `/api/dpp`: create passports, invite suppliers, check completeness, publish,
  upload product images.
* **QR codes** `/api/qr/01/{gtin}[/10/{batch}]`: the data carrier for the label (SVG/PNG).

Normative basis: ESPR (EU) 2024/1781 Art. 9-13 and Annex III, CEN-CLC/JTC 24 (prEN 18219,
18220, 18221, 18216, 18222, 18223, 18239, 18246), GS1 Digital Link URI Syntax 1.4.
"""

OPENAPI_TAGS = [
    {"name": "GS1 Digital Link Resolver", "description": "Public resolver, one URL per label"},
    {"name": "Supplier Portal", "description": "Token-based data ingestion from the supply chain"},
    {"name": "Brand: Passport Authoring", "description": "Requires header X-API-Key"},
    {"name": "Meta", "description": "Health and service description"},
]


async def _handle_domain_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, PassReadyError)
    body: dict[str, object] = {"detail": exc.detail, "code": exc.code, **exc.extra}
    return JSONResponse(status_code=exc.status_code, content=body)


async def _handle_validation_error(request: Request, exc: Exception) -> JSONResponse:
    """Aggregate validation failed after a merge (e.g. dangling certificate reference)."""
    assert isinstance(exc, ValidationError)
    errors = [
        {"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]}
        for e in exc.errors(include_url=False)
    ]
    return JSONResponse(status_code=422, content={"detail": errors, "code": "passport_invalid"})


def create_app(
    settings: Settings | None = None, repository: DppRepository | None = None
) -> FastAPI:
    settings = settings or Settings()
    repository = repository or InMemoryDppRepository()
    if settings.seed_demo_data and not repository.list_all():
        seed_demo_data(repository, settings.supplier_token_ttl_days, settings.media_base_url)

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description=DESCRIPTION,
        openapi_tags=OPENAPI_TAGS,
    )
    app.state.settings = settings
    app.state.repository = repository
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Accept", "X-API-Key", "X-DPP-Role", "X-Supplier-Token"],
        expose_headers=["X-DPP-Role", "X-DPP-Granularity", "X-DPP-Fallback", "X-DPP-Version"],
    )
    app.add_exception_handler(PassReadyError, _handle_domain_error)
    app.add_exception_handler(ValidationError, _handle_validation_error)

    app.include_router(health.router)
    app.include_router(resolver.router)
    app.include_router(qr.router)
    app.include_router(supplier.router)
    app.include_router(dpp.router)

    uploads = Path(settings.media_dir) / "uploads"
    uploads.mkdir(parents=True, exist_ok=True)
    app.mount("/media/uploads", StaticFiles(directory=uploads), name="media-uploads")
    app.mount(
        "/media/demo",
        StaticFiles(directory=Path(__file__).parent / "static" / "demo"),
        name="media-demo",
    )
    return app


app = create_app()
