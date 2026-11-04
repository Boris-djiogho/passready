"""QR code generation for the data carrier (prEN 18220; GS1 Digital Link in a QR code).

The QR encodes nothing but the canonical GS1 Digital Link URI of the passport, so the same
code works at the point of sale (GTIN) and on a phone (resolver). GS1 recommends error
correction level M and a quiet zone of four modules; both are fixed here.
"""

from __future__ import annotations

import io
from typing import Literal

import segno

QrFormat = Literal["svg", "png"]

QR_MEDIA_TYPES: dict[QrFormat, str] = {"svg": "image/svg+xml", "png": "image/png"}
DEFAULT_SCALE: dict[QrFormat, int] = {"svg": 4, "png": 10}
MAX_SCALE = 40
INK = "#14181b"


def render_qr(url: str, fmt: QrFormat, scale: int | None = None) -> bytes:
    """Render the URL as a QR code (error level M, 4-module quiet zone) in SVG or PNG."""
    effective_scale = max(1, min(scale or DEFAULT_SCALE[fmt], MAX_SCALE))
    code = segno.make(url, error="m", micro=False)
    buffer = io.BytesIO()
    if fmt == "svg":
        code.save(buffer, kind="svg", scale=effective_scale, border=4, dark=INK, light=None)
    else:
        code.save(buffer, kind="png", scale=effective_scale, border=4, dark=INK, light="#ffffff")
    return buffer.getvalue()


def qr_version(url: str) -> int:
    """Symbol version (1-40); useful to judge print size: modules = 17 + 4 * version."""
    version = segno.make(url, error="m", micro=False).version
    return int(version)
