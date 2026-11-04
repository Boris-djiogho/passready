"""Mandatory data set for the textile DPP and the gap report against it.

The delegated act for textiles is not adopted yet (expected Q4 2027 per the ESPR working
plan). The rules below encode the JRC preparatory study data set plus ESPR Annex III; each
rule names its basis so the list can be adjusted field by field once the act is final.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from app.models.actors import SupplierRole
from app.models.completeness import CompletenessReport, MissingField, Responsible
from app.models.passport import DigitalProductPassport

Check = Callable[[DigitalProductPassport], bool]


@dataclass(frozen=True)
class Rule:
    path: str
    label: str
    source: str
    responsible: Responsible | None
    check: Check
    mandatory: bool = True
    label_de: str = ""

    def as_missing(self) -> MissingField:
        return MissingField(
            path=self.path,
            label=self.label,
            label_de=self.label_de or None,
            source=self.source,
            responsible=self.responsible,
            mandatory=self.mandatory,
        )


RULES: tuple[Rule, ...] = (
    Rule(
        "identifier.gtin",
        "Product identifier (GTIN)",
        "ESPR Art. 10(1)(b), Annex III (b)(c); prEN 18219",
        "brand",
        lambda d: bool(d.identifier.gtin),
        label_de="Produktkennung (GTIN)",
    ),
    Rule(
        "product.name",
        "Product name",
        "ESPR Annex III (a); JRC textile data set",
        "brand",
        lambda d: bool(d.product.name),
        label_de="Produktname",
    ),
    Rule(
        "product.taric_code",
        "Commodity code (CN/TARIC)",
        "ESPR Annex III (d), Art. 13 customs",
        "brand",
        lambda d: d.product.taric_code is not None,
        label_de="Warennummer (TARIC)",
    ),
    Rule(
        "product.country_of_origin",
        "Country of origin (final manufacturing step)",
        "JRC textile data set; Regulation (EU) 952/2013 Art. 60",
        "brand",
        lambda d: d.product.country_of_origin is not None,
        label_de="Herkunftsland",
    ),
    Rule(
        "economic_operator.eori|gln",
        "Unique operator identifier of the responsible operator",
        "ESPR Annex III (g)(j); prEN 18219",
        "brand",
        lambda d: bool(d.economic_operator.eori or d.economic_operator.gln),
        label_de="Betreiberkennung (EORI oder GLN)",
    ),
    Rule(
        "fiber_compositions",
        "Fibre composition incl. recycled content",
        "Regulation (EU) 1007/2011 Art. 5-9; JRC textile data set (recycled content)",
        SupplierRole.WEAVING,
        lambda d: len(d.fiber_compositions) > 0,
        label_de="Faserzusammensetzung inkl. Rezyklatanteil",
    ),
    Rule(
        "chemical_compliance",
        "Substances of concern (REACH SVHC) and PFAS declaration",
        "ESPR Art. 7(5), Art. 2(27)-(28); REACH Art. 33",
        SupplierRole.DYEING,
        lambda d: d.chemical_compliance is not None,
        label_de="Besorgniserregende Stoffe (REACH) und PFAS-Erklärung",
    ),
    Rule(
        "care_and_durability.care_symbols",
        "Care instructions",
        "JRC textile data set (durability, care); ISO 3758",
        "brand",
        lambda d: bool(d.care_and_durability and d.care_and_durability.care_symbols),
        label_de="Pflegehinweise",
    ),
    Rule(
        "environmental_footprint",
        "Product environmental footprint (carbon)",
        "ESPR Annex I (m)(n), PEF method (Rec. (EU) 2021/2279)",
        SupplierRole.GARMENT_MAKING,
        lambda d: d.environmental_footprint is not None,
        mandatory=False,
        label_de="Umweltfußabdruck (CO2)",
    ),
    Rule(
        "end_of_life",
        "End-of-life and recycling information",
        "ESPR Annex I (h)(o); JRC textile data set",
        "brand",
        lambda d: d.end_of_life is not None,
        mandatory=False,
        label_de="End-of-Life und Recycling",
    ),
    Rule(
        "suppliers",
        "At least one supply-chain actor identified",
        "ESPR Annex III (h)(i); prEN 18219 (operator and facility identifiers)",
        "brand",
        lambda d: len(d.suppliers) > 0,
        mandatory=False,
        label_de="Mindestens ein Lieferant",
    ),
)


def assess(passport: DigitalProductPassport) -> CompletenessReport:
    missing = [r.as_missing() for r in RULES if r.mandatory and not r.check(passport)]
    recommended = [r.as_missing() for r in RULES if not r.mandatory and not r.check(passport)]
    mandatory_total = sum(1 for r in RULES if r.mandatory)
    fulfilled = mandatory_total - len(missing)
    score = round(100.0 * fulfilled / mandatory_total, 1) if mandatory_total else 100.0
    return CompletenessReport(
        complete=not missing, score=score, missing=missing, recommended_missing=recommended
    )


def missing_for_role(passport: DigitalProductPassport, role: SupplierRole) -> list[MissingField]:
    """Gaps a supplier with the given role is typically responsible for."""
    equivalent: dict[SupplierRole, set[SupplierRole]] = {
        SupplierRole.WEAVING: {
            SupplierRole.WEAVING,
            SupplierRole.KNITTING,
            SupplierRole.SPINNING,
            SupplierRole.FIBER_PRODUCTION,
        },
        SupplierRole.DYEING: {
            SupplierRole.DYEING,
            SupplierRole.FINISHING,
            SupplierRole.TRIM_SUPPLIER,
        },
        SupplierRole.GARMENT_MAKING: {SupplierRole.GARMENT_MAKING},
    }
    return [
        r.as_missing()
        for r in RULES
        if isinstance(r.responsible, SupplierRole)
        and role in equivalent.get(r.responsible, {r.responsible})
        and not r.check(passport)
    ]
