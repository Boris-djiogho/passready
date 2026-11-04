"""JSON-LD framing of the consumer/recycler views (GS1 Web Vocabulary, schema.org)."""

from __future__ import annotations

from typing import Any

from app.services.views import AnyView

JSONLD_MEDIA_TYPE = "application/ld+json"

JSONLD_CONTEXT: dict[str, Any] = {
    "@version": 1.1,
    "gs1": "https://gs1.org/voc/",
    "schema": "https://schema.org/",
    "dpp": "https://passready.example/vocab/dpp#",
    "@vocab": "https://passready.example/vocab/dpp#",
    "gtin": "gs1:gtin",
    "batch": "gs1:hasBatchLotNumber",
    "serial": "gs1:hasSerialNumber",
    "digital_link": {"@id": "schema:url", "@type": "@id"},
    "name": "schema:name",
    "description": "schema:description",
    "brand": "schema:brand",
    "website": {"@id": "schema:url", "@type": "@id"},
    "image_urls": {"@id": "schema:image", "@type": "@id"},
    "country_of_origin": "schema:countryOfOrigin",
    "certificates": "gs1:certification",
    "issuer": "gs1:certificationAgency",
    "url": {"@id": "schema:url", "@type": "@id"},
    "composition": "dpp:fibreComposition",
    "pcf_kg_co2e": "dpp:productCarbonFootprintKgCO2e",
    "published_at": {"@id": "schema:datePublished", "@type": "schema:DateTime"},
}


def to_jsonld(view: AnyView) -> dict[str, Any]:
    data = view.model_dump(mode="json")
    return {
        "@context": JSONLD_CONTEXT,
        "@type": "dpp:DigitalProductPassport",
        "@id": data["identifier"]["digital_link"],
        **data,
    }
