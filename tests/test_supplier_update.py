"""Component C: supplier portal data ingestion and the brand flow up to publication."""

from app.services.seed import (
    DEMO_GTIN_JACKET,
    DEMO_GTIN_TEE,
    DEMO_SUPPLIER_WEAVING_ID,
    DEMO_TOKEN_DYEING,
    DEMO_TOKEN_WEAVING,
)

from tests.conftest import AUTHORITY_HEADERS, BRAND_HEADERS

URL = f"/api/dpp/{DEMO_GTIN_JACKET}/supplier-update"
WEAVING = {"X-Supplier-Token": DEMO_TOKEN_WEAVING}
DYEING = {"X-Supplier-Token": DEMO_TOKEN_DYEING}

FIBER_PAYLOAD = {
    "fiber_compositions": [
        {
            "component": "main_fabric",
            "fibers": [
                {
                    "fiber": "cotton",
                    "percentage": 98.0,
                    "recycled_percentage": 25.0,
                    "recycled_source": "post_consumer",
                    "origin_country": "TR",
                    "certificate_ids": ["cert-grs-ege"],
                },
                {"fiber": "elastane", "percentage": 2.0},
            ],
        }
    ],
    "certificates": [
        {
            "certificate_id": "cert-grs-ege",
            "type": "grs",
            "issuer": "Control Union Certifications",
            "number": "CU 900001",
            "url": "https://certificates.example/grs/CU-900001",
            "valid_from": "2026-01-01",
            "valid_until": "2026-12-31",
        }
    ],
    "note": "12 oz indigo denim, lot 2026-11",
}

CHEMISTRY_PAYLOAD = {
    "chemical_compliance": {
        "reach_svhc_above_threshold": False,
        "substances_of_concern": [],
        "pfas_free": True,
        "pfas_declaration_url": "https://maviboya.example/declarations/pfas-2026.pdf",
        "certificate_ids": ["cert-oekotex-mavi"],
    },
    "certificates": [
        {
            "certificate_id": "cert-oekotex-mavi",
            "type": "oeko_tex_standard_100",
            "issuer": "Hohenstein",
            "number": "26.HTR.99999",
            "url": "https://certificates.example/oeko-tex/26.HTR.99999",
            "valid_from": "2026-02-01",
            "valid_until": "2027-01-31",
        }
    ],
}


def _authority_passport(client, gtin=DEMO_GTIN_JACKET):
    response = client.get(f"/01/{gtin}", params={"role": "authority"}, headers=AUTHORITY_HEADERS)
    assert response.status_code == 200
    return response.json()["passport"]


def test_weaving_supplier_appends_fiber_composition(client):
    response = client.post(URL, json=FIBER_PAYLOAD, headers=WEAVING)
    assert response.status_code == 202, response.text
    body = response.json()
    assert body["accepted"] is True
    assert body["passport_version"] == 2
    assert body["status"] == "pending_supplier_data"
    assert body["sections_updated"] == ["certificates", "fiber_compositions"]
    assert body["contribution"]["actor_id"] == DEMO_SUPPLIER_WEAVING_ID
    assert body["contribution"]["supplier_role"] == "weaving"
    assert len(body["contribution"]["payload_sha256"]) == 64
    assert [m["path"] for m in body["missing_after_update"]] == ["chemical_compliance"]

    passport = _authority_passport(client)
    assert passport["fiber_compositions"][0]["fibers"][0]["recycled_percentage"] == 25.0
    weaving = next(s for s in passport["suppliers"] if s["supplier_id"] == DEMO_SUPPLIER_WEAVING_ID)
    assert weaving["data_status"] == "submitted"
    assert passport["certificates"][0]["holder_supplier_id"] == DEMO_SUPPLIER_WEAVING_ID
    assert len(passport["contributions"]) == 2


def test_dyeing_supplier_may_not_touch_fiber_composition(client):
    response = client.post(URL, json=FIBER_PAYLOAD, headers=DYEING)
    assert response.status_code == 403
    body = response.json()
    assert body["code"] == "section_not_allowed"
    assert "fiber_compositions" in body["detail"]
    assert body["allowed_sections"] == ["certificates", "chemical_compliance", "supplier_details"]


def test_missing_unknown_token_is_401(client):
    assert client.post(URL, json=FIBER_PAYLOAD).status_code == 401
    response = client.post(URL, json=FIBER_PAYLOAD, headers={"X-Supplier-Token": "forged"})
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_supplier_token"


def test_token_is_bound_to_its_gtin(client):
    response = client.post(
        f"/api/dpp/{DEMO_GTIN_TEE}/supplier-update", json=FIBER_PAYLOAD, headers=WEAVING
    )
    assert response.status_code == 403
    assert response.json()["code"] == "forbidden"


def test_payload_must_satisfy_the_dpp_schema(client):
    broken = {"fiber_compositions": [{"fibers": [{"fiber": "cotton", "percentage": 90.0}]}]}
    assert client.post(URL, json=broken, headers=WEAVING).status_code == 422
    assert client.post(URL, json={"unknown_section": {}}, headers=WEAVING).status_code == 422
    dangling = {
        "fiber_compositions": [
            {"fibers": [{"fiber": "cotton", "percentage": 100.0, "certificate_ids": ["nope"]}]}
        ]
    }
    assert client.post(URL, json=dangling, headers=WEAVING).status_code == 422


def test_full_flow_from_supplier_data_to_publication(client):
    blocked = client.post(f"/api/dpp/{DEMO_GTIN_JACKET}/publish", headers=BRAND_HEADERS)
    assert blocked.status_code == 409
    assert blocked.json()["code"] == "publish_blocked"
    assert {m["path"] for m in blocked.json()["missing"]} == {
        "fiber_compositions",
        "chemical_compliance",
    }

    assert client.post(URL, json=FIBER_PAYLOAD, headers=WEAVING).status_code == 202
    dyeing = client.post(URL, json=CHEMISTRY_PAYLOAD, headers=DYEING)
    assert dyeing.status_code == 202, dyeing.text
    assert dyeing.json()["status"] == "in_review"
    assert dyeing.json()["missing_after_update"] == []

    report = client.get(f"/api/dpp/{DEMO_GTIN_JACKET}/completeness", headers=BRAND_HEADERS).json()
    assert report["complete"] is True and report["score"] == 100.0

    published = client.post(f"/api/dpp/{DEMO_GTIN_JACKET}/publish", headers=BRAND_HEADERS)
    assert published.status_code == 200
    assert published.json()["status"] == "published"
    assert published.json()["published_at"] is not None
    assert published.json()["version"] == 4

    consumer = client.get(f"/01/{DEMO_GTIN_JACKET}")
    assert consumer.status_code == 200
    assert consumer.json()["composition"][0]["total_recycled_percentage"] == 24.5
    assert consumer.json()["chemistry"]["pfas_free"] is True
    recycler = client.get(f"/01/{DEMO_GTIN_JACKET}", params={"role": "recycler"})
    assert recycler.status_code == 200 and recycler.json()["substances_of_concern"] == []


def test_chemistry_check_flags_pfas_and_inconsistent_claims(client):
    assert (
        client.get(
            f"/api/dpp/{DEMO_GTIN_JACKET}/chemistry-check", headers=BRAND_HEADERS
        ).status_code
        == 409
    )
    payload = {
        "chemical_compliance": {
            "reach_svhc_above_threshold": True,
            "substances_of_concern": [
                {
                    "name": "PFOA",
                    "cas_number": "335-67-1",
                    "concentration_percent": 0.2,
                    "location": "DWR finish",
                }
            ],
            "pfas_free": True,
        }
    }
    assert client.post(URL, json=payload, headers=DYEING).status_code == 202
    check = client.get(f"/api/dpp/{DEMO_GTIN_JACKET}/chemistry-check", headers=BRAND_HEADERS)
    assert check.status_code == 200
    body = check.json()
    assert body["risk_level"] == "high"
    assert body["pfas_claim_consistent"] is False
    finding = body["findings"][0]
    assert finding["matched_name"] == "Perfluorooctanoic acid"
    assert set(finding["matched_lists"]) == {"REACH_SVHC", "PFAS"}
    assert finding["above_svhc_threshold"] is True


def test_supplier_context_shows_role_specific_gaps(client):
    weaving = client.get(f"{URL}/context", headers=WEAVING)
    assert weaving.status_code == 200
    assert [m["path"] for m in weaving.json()["missing_for_me"]] == ["fiber_compositions"]
    assert "fiber_compositions" in weaving.json()["allowed_sections"]
    dyeing = client.get(f"{URL}/context", params={"token": DEMO_TOKEN_DYEING})
    assert [m["path"] for m in dyeing.json()["missing_for_me"]] == ["chemical_compliance"]


def test_brand_invites_new_supplier_and_its_token_works(client):
    invite = client.post(
        f"/api/dpp/{DEMO_GTIN_JACKET}/suppliers",
        json={
            "supplier": {
                "supplier_id": "sup-izmir",
                "name": "Izmir Konfeksiyon AS",
                "role": "garment_making",
                "tier": 1,
                "country": "TR",
            }
        },
        headers=BRAND_HEADERS,
    )
    assert invite.status_code == 201, invite.text
    body = invite.json()
    assert body["supplier_role"] == "garment_making"
    assert "environmental_footprint" in body["allowed_sections"]
    footprint = {
        "environmental_footprint": {
            "pcf_kg_co2e": 9.4,
            "method": "pef",
            "boundary": "cradle_to_gate",
            "reference_year": 2026,
        }
    }
    response = client.post(URL, json=footprint, headers={"X-Supplier-Token": body["token"]})
    assert response.status_code == 202, response.text
    passport = _authority_passport(client)
    assert passport["environmental_footprint"]["pcf_kg_co2e"] == 9.4
    assert len(passport["suppliers"]) == 3


def test_brand_creates_passport_and_duplicates_conflict(client):
    payload = {
        "identifier": {"gtin": "4006381333931"},
        "product": {"name": "Test Hoodie", "category": "knitwear"},
        "economic_operator": {
            "name": "Testlabel UG",
            "role": "brand_owner",
            "eori": "DE1234567890123",
            "address": {
                "street": "Teststr. 1",
                "postal_code": "10115",
                "city": "Berlin",
                "country": "DE",
            },
        },
    }
    created = client.post("/api/dpp", json=payload, headers=BRAND_HEADERS)
    assert created.status_code == 201, created.text
    assert created.json()["identifier"]["gtin"] == "04006381333931"
    assert created.json()["status"] == "draft"
    assert client.post("/api/dpp", json=payload, headers=BRAND_HEADERS).status_code == 409
    listing = client.get("/api/dpp", headers=BRAND_HEADERS).json()
    assert {p["gtin"] for p in listing} >= {"04006381333931", DEMO_GTIN_TEE, DEMO_GTIN_JACKET}
