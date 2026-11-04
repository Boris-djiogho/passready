"""Domain errors. ``app.main`` maps them to HTTP responses so services stay framework-free."""

from __future__ import annotations


class PassReadyError(Exception):
    """Base class; subclasses pin the HTTP status and a stable machine-readable code."""

    status_code: int = 400
    code: str = "passready_error"

    def __init__(self, detail: str, *, extra: dict[str, object] | None = None) -> None:
        super().__init__(detail)
        self.detail = detail
        self.extra: dict[str, object] = extra or {}


class InvalidIdentifierError(PassReadyError, ValueError):
    """Also a ValueError: inside Pydantic validators it becomes a regular ValidationError."""

    status_code = 400
    code = "invalid_identifier"


class PassportNotFoundError(PassReadyError):
    status_code = 404
    code = "passport_not_found"


class PassportNotPublishedError(PassReadyError):
    status_code = 404
    code = "passport_not_published"


class InvalidSupplierTokenError(PassReadyError):
    status_code = 401
    code = "invalid_supplier_token"


class ForbiddenError(PassReadyError):
    status_code = 403
    code = "forbidden"


class SectionNotAllowedError(PassReadyError):
    status_code = 403
    code = "section_not_allowed"


class ConflictError(PassReadyError):
    status_code = 409
    code = "conflict"


class PublishBlockedError(PassReadyError):
    status_code = 409
    code = "publish_blocked"
