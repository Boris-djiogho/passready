"""Component B: GS1 Digital Link resolver with role-based routing."""

import json

from app.services.seed import DEMO_BATCH_TEE, DEMO_GTIN_JACKET, DEMO_GTIN_TEE

from tests.conftest import AUTHORITY_HEADERS, BRAND_HEADERS, LANDING_BASE, RESOLVER_BASE

UNKNOWN_GTIN = "04012345999990"  # valid check digit, no passport


def test_default_role_is_consumer_and_hides_supplier_data(client):
    response = client.get(f"/01/{DEMO_GTIN_TEE}")
    assert response.status_code == 200
    assert response.headers["X-DPP-Role"] == "consumer"
    body = response.json()
    assert body["role"] == "consumer"
    assert "suppliers" not in body and "passport" not in body
    assert "eori" not in json.dumps(body)
    assert body["brand"] == {
        "name": "Nordlicht Apparel GmbH",
        "website": "https://nordlicht-apparel.example/",
    }
    assert body["identifier"]["digital_link"] == f"{RESOLVER_BASE}/01/{DEMO_GTIN_TEE}"
    fibres = body["composition"][0]["fibers"]
    assert fibres[0] == {
        "fiber": "cotton",
        "label": "Cotton",
        "percentage": 95.0,
        "recycled_percentage": 20.0,
    }
    assert body["composition"][0]["total_recycled_percentage"] == 19.0
    # certificate numbers and non-public declarations stay hidden
    assert all("number" not in cert for cert in body["certificates"])
    assert "pfas_declaration" not in {cert["type"] for cert in body["certificates"]}
    assert body["chemistry"] == {
        "contains_substances_of_concern": False,
        "substances": [],
        "pfas_free": True,
    }


def test_recycler_role_via_header_gets_material_detail_without_commercial_data(client):
    response = client.get(f"/01/{DEMO_GTIN_TEE}", headers={"X-DPP-Role": "recycler"})
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "recycler"
    assert body["compositions"][0]["fibers"][0]["origin_country"] == "TR"
    assert body["end_of_life"]["disassembly_instructions"].startswith("Cut off")
    assert "substances_of_concern" in body
    assert "suppliers" not in body and "economic_operator" not in body


def test_authority_with_key_sees_full_passport_and_gap_report(client):
    response = client.get(
        f"/01/{DEMO_GTIN_TEE}", params={"role": "authority"}, headers=AUTHORITY_HEADERS
    )
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    body = response.json()
    assert body["role"] == "authority"
    passport = body["passport"]
    assert len(passport["suppliers"]) == 3
    assert passport["economic_operator"]["eori"] == "DE123456789012345"
    assert passport["certificates"][0]["number"] == "CU 812345"
    assert body["completeness"]["complete"] is True


def test_authority_without_or_with_wrong_key_is_forbidden(client):
    assert client.get(f"/01/{DEMO_GTIN_TEE}", params={"role": "authority"}).status_code == 403
    response = client.get(
        f"/01/{DEMO_GTIN_TEE}", params={"role": "authority"}, headers={"X-API-Key": "nope"}
    )
    assert response.status_code == 403


def test_query_role_overrides_header_role(client):
    response = client.get(
        f"/01/{DEMO_GTIN_TEE}", params={"role": "recycler"}, headers={"X-DPP-Role": "consumer"}
    )
    assert response.json()["role"] == "recycler"


def test_unknown_role_is_rejected(client):
    assert client.get(f"/01/{DEMO_GTIN_TEE}", params={"role": "hacker"}).status_code == 422


def test_invalid_gtin_check_digit_is_400(client):
    response = client.get("/01/04012345678902")
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_identifier"


def test_invalid_batch_characters_are_400(client):
    assert client.get(f"/01/{DEMO_GTIN_TEE}/10/LOT%202026").status_code == 400


def test_unknown_gtin_is_404(client):
    response = client.get(f"/01/{UNKNOWN_GTIN}")
    assert response.status_code == 404
    assert response.json()["code"] == "passport_not_found"


def test_batch_level_exact_hit(client):
    response = client.get(f"/01/{DEMO_GTIN_TEE}/10/{DEMO_BATCH_TEE}")
    assert response.status_code == 200
    assert response.headers["X-DPP-Granularity"] == "batch"
    assert response.headers["X-DPP-Fallback"] == "false"
    body = response.json()
    assert body["identifier"]["batch"] == DEMO_BATCH_TEE
    assert "test_report" in {cert["type"] for cert in body["certificates"]}


def test_unknown_batch_falls_back_to_model_level_passport(client):
    response = client.get(f"/01/{DEMO_GTIN_TEE}/10/LOT9999")
    assert response.status_code == 200
    assert response.headers["X-DPP-Granularity"] == "model"
    assert response.headers["X-DPP-Fallback"] == "true"
    body = response.json()
    assert body["identifier"]["batch"] is None
    assert body["resolution"] == {
        "requested_batch": "LOT9999",
        "requested_serial": None,
        "served_granularity": "model",
        "fallback": True,
    }


def test_item_level_routes_fall_back_hierarchically(client):
    with_batch = client.get(f"/01/{DEMO_GTIN_TEE}/10/{DEMO_BATCH_TEE}/21/SN0001")
    assert with_batch.status_code == 200
    assert with_batch.headers["X-DPP-Granularity"] == "batch"
    assert with_batch.headers["X-DPP-Fallback"] == "true"
    serial_only = client.get(f"/01/{DEMO_GTIN_TEE}/21/SN0001")
    assert serial_only.status_code == 200
    assert serial_only.headers["X-DPP-Granularity"] == "model"


def test_unpublished_passport_is_hidden_from_consumers_but_visible_to_authorities(client):
    consumer = client.get(f"/01/{DEMO_GTIN_JACKET}")
    assert consumer.status_code == 404
    assert consumer.json()["code"] == "passport_not_published"
    authority = client.get(
        f"/01/{DEMO_GTIN_JACKET}", params={"role": "authority"}, headers=AUTHORITY_HEADERS
    )
    assert authority.status_code == 200
    body = authority.json()
    assert body["passport"]["status"] == "pending_supplier_data"
    assert body["completeness"]["complete"] is False
    assert [m["path"] for m in body["completeness"]["missing"]] == [
        "fiber_compositions",
        "chemical_compliance",
    ]


def test_linkset_lists_role_specific_links(client):
    response = client.get(f"/01/{DEMO_GTIN_TEE}", params={"linkType": "linkset"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/linkset+json")
    entry = response.json()["linkset"][0]
    assert entry["anchor"] == f"{RESOLVER_BASE}/01/{DEMO_GTIN_TEE}"
    assert entry["https://gs1.org/voc/recyclingInfo"][0]["href"].endswith("?role=recycler")


def test_json_ld_on_request(client):
    response = client.get(f"/01/{DEMO_GTIN_TEE}", headers={"Accept": "application/ld+json"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/ld+json")
    body = response.json()
    assert body["@context"]["gs1"] == "https://gs1.org/voc/"
    assert body["@id"] == f"{RESOLVER_BASE}/01/{DEMO_GTIN_TEE}"
    assert body["role"] == "consumer"


def test_browser_is_redirected_only_when_landing_page_is_configured(client, client_with_landing):
    redirected = client_with_landing.get(
        f"/01/{DEMO_GTIN_TEE}/10/{DEMO_BATCH_TEE}",
        headers={"Accept": "text/html"},
        follow_redirects=False,
    )
    assert redirected.status_code == 307
    assert (
        redirected.headers["location"] == f"{LANDING_BASE}/01/{DEMO_GTIN_TEE}/10/{DEMO_BATCH_TEE}"
    )
    explicit = client_with_landing.get(
        f"/01/{DEMO_GTIN_TEE}", params={"role": "recycler"}, headers={"Accept": "text/html"}
    )
    assert explicit.status_code == 200
    plain = client.get(f"/01/{DEMO_GTIN_TEE}", headers={"Accept": "text/html"})
    assert plain.status_code == 200 and plain.json()["role"] == "consumer"


def test_scans_are_counted_and_only_consumer_scans_are_billable(client):
    client.get(f"/01/{DEMO_GTIN_TEE}")
    client.get(f"/01/{DEMO_GTIN_TEE}/10/{DEMO_BATCH_TEE}")
    client.get(f"/01/{DEMO_GTIN_TEE}", params={"role": "recycler"})
    client.get(f"/01/{DEMO_GTIN_TEE}", params={"role": "authority"}, headers=AUTHORITY_HEADERS)
    client.get(f"/01/{DEMO_GTIN_TEE}", params={"linkType": "linkset"})  # not a passport read
    assert client.get(f"/api/dpp/{DEMO_GTIN_TEE}/scans").status_code == 401
    summary = client.get(f"/api/dpp/{DEMO_GTIN_TEE}/scans", headers=BRAND_HEADERS).json()
    assert summary["total"] == 4
    assert summary["billable"] == 2
    assert summary["by_role"] == {"authority": 1, "consumer": 2, "recycler": 1}


def test_well_known_resolver_description(client):
    response = client.get("/.well-known/gs1resolver")
    assert response.status_code == 200
    body = response.json()
    assert body["supportedPrimaryKeys"] == ["01"]
    assert body["resolverRoot"] == RESOLVER_BASE


def test_cors_allows_the_frontend_origin(client):
    response = client.options(
        f"/01/{DEMO_GTIN_TEE}",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "X-DPP-Role",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    plain = client.get(f"/01/{DEMO_GTIN_TEE}", headers={"Origin": "http://localhost:5173"})
    assert "X-DPP-Granularity" in plain.headers["access-control-expose-headers"]
