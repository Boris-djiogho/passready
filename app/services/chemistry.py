"""Chemistry check: screen declared substances against reference lists.

The embedded list is a small, verified demo extract. Production replaces it with an import of
the ECHA Candidate List (REACH Art. 59), REACH Annex XVII restrictions and the PFAS
restriction scope; the screening logic stays the same.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from pydantic import Field

from app.models.chemistry import SVHC_INFORMATION_THRESHOLD_PERCENT, ChemicalCompliance
from app.models.common import DppViewModel, utcnow

ReferenceList = Literal["REACH_SVHC", "PFAS", "REACH_ANNEX_XVII"]
RiskLevel = Literal["none", "review", "high"]

REFERENCE_LIST_VERSION = "demo-extract-2026-11"


@dataclass(frozen=True)
class ReferenceSubstance:
    cas: str
    name: str
    lists: tuple[ReferenceList, ...]
    aliases: tuple[str, ...] = ()


REFERENCE_SUBSTANCES: tuple[ReferenceSubstance, ...] = (
    ReferenceSubstance("117-81-7", "Bis(2-ethylhexyl) phthalate", ("REACH_SVHC",), ("DEHP",)),
    ReferenceSubstance("84-74-2", "Dibutyl phthalate", ("REACH_SVHC",), ("DBP",)),
    ReferenceSubstance("85-68-7", "Benzyl butyl phthalate", ("REACH_SVHC",), ("BBP",)),
    ReferenceSubstance("84-69-5", "Diisobutyl phthalate", ("REACH_SVHC",), ("DIBP",)),
    ReferenceSubstance("335-67-1", "Perfluorooctanoic acid", ("REACH_SVHC", "PFAS"), ("PFOA",)),
    ReferenceSubstance("1763-23-1", "Perfluorooctane sulfonic acid", ("PFAS",), ("PFOS",)),
    ReferenceSubstance(
        "355-46-4", "Perfluorohexane sulfonic acid", ("REACH_SVHC", "PFAS"), ("PFHxS",)
    ),
    ReferenceSubstance(
        "375-73-5", "Perfluorobutane sulfonic acid", ("REACH_SVHC", "PFAS"), ("PFBS",)
    ),
    ReferenceSubstance("375-95-1", "Perfluorononanoic acid", ("REACH_SVHC", "PFAS"), ("PFNA",)),
    ReferenceSubstance("80-05-7", "Bisphenol A", ("REACH_SVHC",), ("BPA",)),
    ReferenceSubstance("7439-92-1", "Lead", ("REACH_SVHC", "REACH_ANNEX_XVII")),
    ReferenceSubstance("7440-43-9", "Cadmium", ("REACH_SVHC", "REACH_ANNEX_XVII")),
    ReferenceSubstance("1333-82-0", "Chromium trioxide", ("REACH_SVHC",)),
    ReferenceSubstance("140-66-9", "4-tert-Octylphenol", ("REACH_SVHC",)),
    ReferenceSubstance(
        "9016-45-9", "Nonylphenol, ethoxylated", ("REACH_SVHC", "REACH_ANNEX_XVII"), ("NPEO",)
    ),
    ReferenceSubstance("50-00-0", "Formaldehyde", ("REACH_ANNEX_XVII",)),
)

_BY_CAS: dict[str, ReferenceSubstance] = {s.cas: s for s in REFERENCE_SUBSTANCES}
_BY_NAME: dict[str, ReferenceSubstance] = {
    alias.lower(): s for s in REFERENCE_SUBSTANCES for alias in (s.name, *s.aliases)
}


class ChemistryFinding(DppViewModel):
    declared_name: str
    cas_number: str | None
    matched_name: str
    matched_lists: list[ReferenceList]
    concentration_percent: float
    above_svhc_threshold: bool
    location: str | None


class ChemistryScreeningResult(DppViewModel):
    screened_at: datetime = Field(default_factory=utcnow)
    reference_list_version: str = REFERENCE_LIST_VERSION
    findings: list[ChemistryFinding]
    pfas_claim_consistent: bool
    svhc_flag_consistent: bool
    risk_level: RiskLevel
    notes: list[str]


def screen(compliance: ChemicalCompliance) -> ChemistryScreeningResult:
    findings: list[ChemistryFinding] = []
    for substance in compliance.substances_of_concern:
        reference = None
        if substance.cas_number:
            reference = _BY_CAS.get(substance.cas_number)
        if reference is None:
            reference = _BY_NAME.get(substance.name.lower())
        if reference is None:
            continue
        findings.append(
            ChemistryFinding(
                declared_name=substance.name,
                cas_number=substance.cas_number,
                matched_name=reference.name,
                matched_lists=list(reference.lists),
                concentration_percent=substance.concentration_percent,
                above_svhc_threshold=(
                    "REACH_SVHC" in reference.lists
                    and substance.concentration_percent > SVHC_INFORMATION_THRESHOLD_PERCENT
                ),
                location=substance.location,
            )
        )

    pfas_hits = [f for f in findings if "PFAS" in f.matched_lists]
    svhc_above = [f for f in findings if f.above_svhc_threshold]
    notes: list[str] = []

    pfas_claim_consistent = not (compliance.pfas_free and pfas_hits)
    if not pfas_claim_consistent:
        notes.append("pfas_free is true although a PFAS substance is declared")
    if not compliance.pfas_free and not pfas_hits:
        notes.append("pfas_free is false but no PFAS substance is listed; add the substance")

    svhc_flag_consistent = compliance.reach_svhc_above_threshold == bool(svhc_above)
    if not svhc_flag_consistent:
        notes.append("reach_svhc_above_threshold does not match the declared concentrations")

    risk: RiskLevel
    if pfas_hits or svhc_above:
        risk = "high"
    elif findings or notes:
        risk = "review"
    else:
        risk = "none"

    return ChemistryScreeningResult(
        findings=findings,
        pfas_claim_consistent=pfas_claim_consistent,
        svhc_flag_consistent=svhc_flag_consistent,
        risk_level=risk,
        notes=notes,
    )
