import pytest
from app.models.actors import Address, EconomicOperator, OperatorRole
from app.models.certificates import Certificate, CertificateType
from app.models.chemistry import ChemicalCompliance, SubstanceOfConcern, validate_cas_number
from app.models.identifiers import DppIdentifier, Granularity
from app.models.materials import FiberComponent, FiberComposition, FiberType
from pydantic import ValidationError


def test_fibre_percentages_must_total_100():
    with pytest.raises(ValidationError, match="must total 100"):
        FiberComposition(
            fibers=[
                FiberComponent(fiber=FiberType.COTTON, percentage=60.0),
                FiberComponent(fiber=FiberType.POLYESTER, percentage=30.0),
            ]
        )


def test_fibre_tolerance_and_weighted_recycled_share():
    composition = FiberComposition(
        fibers=[
            FiberComponent(fiber=FiberType.COTTON, percentage=50.5, recycled_percentage=40.0),
            FiberComponent(fiber=FiberType.POLYESTER, percentage=50.0),
        ]
    )
    assert composition.total_recycled_percentage() == 20.2


def test_other_fibre_needs_a_name():
    with pytest.raises(ValidationError, match="fiber_name_other"):
        FiberComponent(fiber=FiberType.OTHER, percentage=100.0)
    assert (
        FiberComponent(fiber=FiberType.OTHER, fiber_name_other="Seacell", percentage=100.0).label
        == "Seacell"
    )


def test_identifier_normalises_gtin_and_derives_granularity():
    model = DppIdentifier(gtin="4006381333931")
    assert model.gtin == "04006381333931"
    assert model.granularity is Granularity.MODEL
    assert DppIdentifier(gtin="4006381333931", batch="LOT1").granularity is Granularity.BATCH
    assert DppIdentifier(gtin="4006381333931", serial="SN1").granularity is Granularity.ITEM
    assert model.digital_link("https://id.test") == "https://id.test/01/04006381333931"
    with pytest.raises(ValidationError):
        DppIdentifier(gtin="4006381333931", batch="LOT 1")


def test_chemical_flags_must_match_declared_substances():
    pfoa = SubstanceOfConcern(name="PFOA", cas_number="335-67-1", concentration_percent=0.5)
    with pytest.raises(ValidationError, match="exceed"):
        ChemicalCompliance(
            reach_svhc_above_threshold=False, substances_of_concern=[pfoa], pfas_free=False
        )
    ChemicalCompliance(
        reach_svhc_above_threshold=True, substances_of_concern=[pfoa], pfas_free=False
    )
    with pytest.raises(ValidationError, match="no substances"):
        ChemicalCompliance(reach_svhc_above_threshold=True, pfas_free=True)


def test_cas_number_check_digit():
    assert validate_cas_number("7732-18-5") == "7732-18-5"
    with pytest.raises(ValueError):
        validate_cas_number("7732-18-4")
    with pytest.raises(ValidationError):
        SubstanceOfConcern(name="x", cas_number="12-34", concentration_percent=1.0)


def test_certificate_dates_and_https_only():
    with pytest.raises(ValidationError, match="valid_until"):
        Certificate(
            type=CertificateType.GOTS,
            issuer="CU",
            valid_from="2026-02-01",
            valid_until="2026-01-01",
        )
    with pytest.raises(ValidationError, match="https"):
        Certificate(type=CertificateType.GOTS, issuer="CU", url="http://insecure.example/cert")


def test_operator_needs_eori_or_gln():
    address = Address(street="A 1", postal_code="12345", city="Berlin", country="DE")
    with pytest.raises(ValidationError, match="EORI or GLN"):
        EconomicOperator(name="X", role=OperatorRole.BRAND_OWNER, address=address)
    EconomicOperator(name="X", role=OperatorRole.BRAND_OWNER, address=address, gln="4012345000009")


def test_unknown_fields_are_rejected():
    with pytest.raises(ValidationError):
        FiberComponent(fiber=FiberType.COTTON, percentage=100.0, colour="blue")
