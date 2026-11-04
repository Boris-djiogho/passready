"""GS1 identifier helpers.

Covers the parts of the GS1 system a textile DPP relies on:

* GTIN check digit and normalisation to GTIN-14 (GS1 General Specifications, section 7.9).
* Value rules for AI (10) batch/lot and AI (21) serial: 1 to 20 characters from GS1
  character set 82 (GS1 General Specifications, section 3 and figure 7.11-1).
* GS1 Digital Link URI syntax ``{root}/01/{gtin}/10/{lot}/21/{serial}``
  (GS1 Digital Link Standard: URI Syntax, release 1.4).

ESPR Art. 10(1)(b) and prEN 18219 require product identifiers and data carriers to follow
ISO/IEC 15459; GTIN plus serial issued under GS1 rules satisfy that requirement.
"""

from __future__ import annotations

import re
from urllib.parse import quote, unquote, urlparse

from app.core.errors import InvalidIdentifierError

GTIN_LENGTHS: frozenset[int] = frozenset({8, 12, 13, 14})
GLN_LENGTH = 13
PRIMARY_KEY_GTIN = "01"
QUALIFIER_BATCH = "10"
QUALIFIER_SERIAL = "21"

_DIGITS = re.compile(r"^\d+$")
_AI_CHARSET_82 = re.compile(r"""^[A-Za-z0-9!"%&'()*+,\-./:;<=>?_]{1,20}$""")


def gs1_check_digit(payload: str) -> int:
    """Return the modulo-10 check digit for a GS1 key payload (digits without check digit)."""
    if not _DIGITS.match(payload):
        raise InvalidIdentifierError(f"GS1 key payload must be numeric, got {payload!r}")
    total = 0
    for index, char in enumerate(reversed(payload)):
        weight = 3 if index % 2 == 0 else 1
        total += int(char) * weight
    return (10 - total % 10) % 10


def with_check_digit(payload: str) -> str:
    """Append the check digit to a GS1 key payload."""
    return f"{payload}{gs1_check_digit(payload)}"


def normalize_gtin(raw: str) -> str:
    """Validate a GTIN-8/12/13/14 and return it zero-padded to 14 digits."""
    value = raw.strip()
    if not _DIGITS.match(value):
        raise InvalidIdentifierError(f"GTIN must contain digits only, got {raw!r}")
    if len(value) not in GTIN_LENGTHS:
        raise InvalidIdentifierError(
            f"GTIN must have 8, 12, 13 or 14 digits, got {len(value)} ({raw!r})"
        )
    if gs1_check_digit(value[:-1]) != int(value[-1]):
        raise InvalidIdentifierError(f"GTIN {raw!r} has an invalid check digit")
    return value.zfill(14)


def validate_gln(raw: str) -> str:
    """Validate a 13-digit Global Location Number (party or facility identifier)."""
    value = raw.strip()
    if not _DIGITS.match(value) or len(value) != GLN_LENGTH:
        raise InvalidIdentifierError(f"GLN must have exactly 13 digits, got {raw!r}")
    if gs1_check_digit(value[:-1]) != int(value[-1]):
        raise InvalidIdentifierError(f"GLN {raw!r} has an invalid check digit")
    return value


def validate_ai_value(value: str, ai: str) -> str:
    """Validate a batch (AI 10) or serial (AI 21) value against GS1 character set 82."""
    if not _AI_CHARSET_82.match(value):
        raise InvalidIdentifierError(
            f"GS1 AI ({ai}) value {value!r} must be 1-20 characters from GS1 character set 82"
        )
    return value


def build_digital_link(
    base_url: str, gtin: str, batch: str | None = None, serial: str | None = None
) -> str:
    """Build a canonical GS1 Digital Link URI for the given identifiers."""
    parts = [base_url.rstrip("/"), PRIMARY_KEY_GTIN, normalize_gtin(gtin)]
    if batch:
        parts += [QUALIFIER_BATCH, quote(validate_ai_value(batch, QUALIFIER_BATCH), safe="")]
    if serial:
        parts += [QUALIFIER_SERIAL, quote(validate_ai_value(serial, QUALIFIER_SERIAL), safe="")]
    return "/".join(parts)


def parse_digital_link(url: str) -> tuple[str, str | None, str | None]:
    """Extract (gtin14, batch, serial) from a GS1 Digital Link URI."""
    segments = [s for s in urlparse(url).path.split("/") if s]
    if len(segments) < 2 or len(segments) % 2 != 0 or segments[0] != PRIMARY_KEY_GTIN:
        raise InvalidIdentifierError(f"not a GS1 Digital Link with primary key (01): {url!r}")
    gtin = normalize_gtin(segments[1])
    batch: str | None = None
    serial: str | None = None
    for ai, value in zip(segments[2::2], segments[3::2], strict=True):
        decoded = unquote(value)
        if ai == QUALIFIER_BATCH and batch is None:
            batch = validate_ai_value(decoded, ai)
        elif ai == QUALIFIER_SERIAL and serial is None:
            serial = validate_ai_value(decoded, ai)
        else:
            raise InvalidIdentifierError(f"unsupported or repeated key qualifier ({ai}) in {url!r}")
    return gtin, batch, serial
