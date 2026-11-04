"""Supplier reminders (outbox), supplier status, and product image ordering."""

from app.services.seed import DEMO_GTIN_JACKET, DEMO_GTIN_TEE, DEMO_SUPPLIER_WEAVING_ID

from tests.conftest import BRAND_HEADERS
from tests.test_qr_and_media import _png_bytes


def test_supplier_statuses_flag_overdue_pending_suppliers(client):
    response = client.get(f"/api/dpp/{DEMO_GTIN_JACKET}/suppliers", headers=BRAND_HEADERS)
    assert response.status_code == 200
    statuses = {s["supplier"]["supplier_id"]: s for s in response.json()}
    weaving = statuses[DEMO_SUPPLIER_WEAVING_ID]
    assert weaving["reminder_due"] is True
    assert weaving["days_waiting"] >= 9
    assert weaving["portal_link"].startswith("http://localhost:5173/supplier/")
    assert weaving["invitation_valid_until"] is not None

    delivered = client.get(f"/api/dpp/{DEMO_GTIN_TEE}/suppliers", headers=BRAND_HEADERS).json()
    assert all(s["reminder_due"] is False and s["days_waiting"] == 0 for s in delivered)


def test_reminder_composes_message_and_records_it(client):
    response = client.post(
        f"/api/dpp/{DEMO_GTIN_JACKET}/suppliers/{DEMO_SUPPLIER_WEAVING_ID}/remind",
        headers=BRAND_HEADERS,
        json={"note": "Wir brauchen die Daten bis Freitag."},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["reminder_count"] == 1
    assert body["message"]["to"] == "export@egedenim.example.org"
    assert body["message"]["delivery"] == "outbox" and body["message"]["delivered"] is False
    assert "Faserzusammensetzung" in body["message"]["body"]
    assert "Wir brauchen die Daten bis Freitag." in body["message"]["body"]
    assert body["portal_link"] in body["message"]["body"]
    assert any("Postausgang" in warning for warning in body["warnings"])

    outbox = client.get(f"/api/dpp/{DEMO_GTIN_JACKET}/outbox", headers=BRAND_HEADERS).json()
    assert len(outbox) == 1 and outbox[0]["subject"].startswith(
        "Produktpass Nordlicht Denim Jacket"
    )

    statuses = client.get(f"/api/dpp/{DEMO_GTIN_JACKET}/suppliers", headers=BRAND_HEADERS).json()
    weaving = next(s for s in statuses if s["supplier"]["supplier_id"] == DEMO_SUPPLIER_WEAVING_ID)
    assert weaving["supplier"]["reminder_count"] == 1
    assert weaving["reminder_due"] is False

    passport = client.get(f"/api/dpp/{DEMO_GTIN_JACKET}", headers=BRAND_HEADERS).json()
    assert passport["contributions"][-1]["note"].startswith("reminder to Ege Denim")


def test_reminder_link_uses_the_existing_open_invitation(client):
    response = client.post(
        f"/api/dpp/{DEMO_GTIN_JACKET}/suppliers/{DEMO_SUPPLIER_WEAVING_ID}/remind",
        headers=BRAND_HEADERS,
    )
    assert response.json()["portal_link"].endswith("?token=demo-token-weaving-2026")


def test_reminder_is_refused_for_delivered_suppliers(client):
    response = client.post(
        f"/api/dpp/{DEMO_GTIN_TEE}/suppliers/sup-tecelagem/remind", headers=BRAND_HEADERS
    )
    assert response.status_code == 409
    assert response.json()["code"] == "conflict"


def test_images_can_be_reordered_and_removed(client, tmp_path):
    client.app.state.settings.media_dir = str(tmp_path)
    upload = client.post(
        f"/api/dpp/{DEMO_GTIN_JACKET}/images",
        headers=BRAND_HEADERS,
        files={"file": ("foto.png", _png_bytes(), "image/png")},
    ).json()
    demo, uploaded = upload["image_urls"]
    assert demo.endswith("denim-jacket.svg")

    reordered = client.put(
        f"/api/dpp/{DEMO_GTIN_JACKET}/images",
        headers=BRAND_HEADERS,
        json={"image_urls": [uploaded, demo]},
    )
    assert reordered.status_code == 200, reordered.text
    assert reordered.json()["product"]["image_urls"][0] == uploaded

    consumer = client.get(f"/01/{DEMO_GTIN_TEE}").json()  # published demo unaffected
    assert consumer["product"]["image_urls"][0].endswith("organic-tee.svg")

    removed = client.put(
        f"/api/dpp/{DEMO_GTIN_JACKET}/images", headers=BRAND_HEADERS, json={"image_urls": [demo]}
    )
    assert removed.status_code == 200
    assert removed.json()["product"]["image_urls"] == [demo]
    assert list((tmp_path / "uploads" / DEMO_GTIN_JACKET).iterdir()) == []

    unknown = client.put(
        f"/api/dpp/{DEMO_GTIN_JACKET}/images",
        headers=BRAND_HEADERS,
        json={"image_urls": ["https://elsewhere.example/x.png"]},
    )
    assert unknown.status_code == 400
