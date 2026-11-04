import pytest
from app.core.errors import InvalidIdentifierError
from app.core.gs1 import (
    build_digital_link,
    gs1_check_digit,
    normalize_gtin,
    parse_digital_link,
    validate_ai_value,
    validate_gln,
    with_check_digit,
)


def test_check_digit_of_known_gtin13():
    assert gs1_check_digit("400638133393") == 1
    assert with_check_digit("0401234567890") == "04012345678901"


def test_normalize_pads_gtin13_to_14():
    assert normalize_gtin("4006381333931") == "04006381333931"
    assert normalize_gtin(" 04012345678901 ") == "04012345678901"


@pytest.mark.parametrize("bad", ["04012345678902", "123", "ABCDEFGHIJKLMN", ""])
def test_normalize_rejects_invalid_gtins(bad):
    with pytest.raises(InvalidIdentifierError):
        normalize_gtin(bad)


def test_ai_values_follow_gs1_character_set_82():
    assert validate_ai_value("LOT2026A", "10") == "LOT2026A"
    assert validate_ai_value("SN-0001/B", "21") == "SN-0001/B"
    with pytest.raises(InvalidIdentifierError):
        validate_ai_value("LOT 2026", "10")
    with pytest.raises(InvalidIdentifierError):
        validate_ai_value("X" * 21, "21")


def test_gln_check_digit():
    assert validate_gln("4012345000009") == "4012345000009"
    with pytest.raises(InvalidIdentifierError):
        validate_gln("4012345000008")


def test_digital_link_build_and_parse_roundtrip():
    url = build_digital_link("https://id.example/", "4006381333931", "LOT/1", "SN_001")
    assert url == "https://id.example/01/04006381333931/10/LOT%2F1/21/SN_001"
    assert parse_digital_link(url) == ("04006381333931", "LOT/1", "SN_001")
    assert parse_digital_link("https://id.example/01/04012345678901") == (
        "04012345678901",
        None,
        None,
    )


def test_parse_rejects_non_digital_links():
    with pytest.raises(InvalidIdentifierError):
        parse_digital_link("https://id.example/product/123")
    with pytest.raises(InvalidIdentifierError):
        parse_digital_link("https://id.example/01/04012345678901/99/X")
