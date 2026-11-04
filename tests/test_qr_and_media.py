"""QR codes for labels and product image uploads."""

import struct
import zlib

from app.services.seed import DEMO_BATCH_TEE, DEMO_GTIN_JACKET, DEMO_GTIN_TEE

from tests.conftest import BRAND_HEADERS, RESOLVER_BASE


def _png_bytes(width: int = 2, height: int = 2) -> bytes:
    """Smallest valid PNG we can build without Pillow."""
    raw = b"".join(b"\x00" + b"\x00\x00\x00" * width for _ in range(height))

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def test_qr_svg_encodes_the_digital_link(client):
    response = client.get(f"/api/qr/01/{DEMO_GTIN_TEE}/10/{DEMO_BATCH_TEE}")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/svg+xml")
    assert (
        response.headers["X-Digital-Link"]
        == f"{RESOLVER_BASE}/01/{DEMO_GTIN_TEE}/10/{DEMO_BATCH_TEE}"
    )
    assert (
        response.headers["Content-Disposition"]
        == f'inline; filename="dpp-{DEMO_GTIN_TEE}-{DEMO_BATCH_TEE}.svg"'
    )
    assert response.text.lstrip().startswith("<?xml") and "<svg" in response.text


def test_qr_png_and_download_disposition(client):
    response = client.get(
        f"/api/qr/01/{DEMO_GTIN_TEE}", params={"format": "png", "scale": 6, "download": "true"}
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert response.headers["Content-Disposition"].startswith("attachment;")


def test_qr_rejects_invalid_identifiers(client):
    assert client.get("/api/qr/01/04012345678902").status_code == 400
    assert client.get(f"/api/qr/01/{DEMO_GTIN_TEE}", params={"format": "gif"}).status_code == 422
    assert client.get(f"/api/qr/01/{DEMO_GTIN_TEE}/10/LOT%202026").status_code == 400


def test_seeded_demo_images_are_served(client):
    consumer = client.get(f"/01/{DEMO_GTIN_TEE}").json()
    image_url = consumer["product"]["image_urls"][0]
    assert image_url.endswith("/media/demo/organic-tee.svg")
    served = client.get("/media/demo/organic-tee.svg")
    assert served.status_code == 200
    assert "<svg" in served.text


def test_image_upload_attaches_to_passport(client, tmp_path):
    client.app.state.settings.media_dir = str(tmp_path)
    response = client.post(
        f"/api/dpp/{DEMO_GTIN_JACKET}/images",
        headers=BRAND_HEADERS,
        files={"file": ("jacke.png", _png_bytes(), "image/png")},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["url"].startswith("http://localhost:8000/media/uploads/")
    assert body["url"].endswith(".png")
    assert body["passport_version"] == 2
    assert len(body["image_urls"]) == 2
    stored = tmp_path / "uploads" / DEMO_GTIN_JACKET
    assert len(list(stored.iterdir())) == 1
    passport = client.get(f"/api/dpp/{DEMO_GTIN_JACKET}", headers=BRAND_HEADERS).json()
    assert passport["contributions"][-1]["sections"] == ["product.image_urls"]


def test_image_upload_rejects_non_images_and_requires_brand_key(client, tmp_path):
    client.app.state.settings.media_dir = str(tmp_path)
    fake = client.post(
        f"/api/dpp/{DEMO_GTIN_JACKET}/images",
        headers=BRAND_HEADERS,
        files={"file": ("evil.png", b"<script>alert(1)</script>", "image/png")},
    )
    assert fake.status_code == 415
    assert fake.json()["code"] == "unsupported_image"
    unauthenticated = client.post(
        f"/api/dpp/{DEMO_GTIN_JACKET}/images", files={"file": ("x.png", _png_bytes(), "image/png")}
    )
    assert unauthenticated.status_code == 401
