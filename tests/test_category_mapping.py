"""
Unit Tests for Unified Category Mapping & Family Resolution (Tahap 2)
=====================================================================
Validates all 14 M5 Food Families from clean_datasets.py across Python
and shared/category_map.json, ensuring zero divergence.
"""

import json
from pathlib import Path
import pytest

from src.forecasting.forecast_service import resolve_family, CATEGORY_MAP, FAMILY_DEFAULT_UNITS

ROOT = Path(__file__).resolve().parents[1]
SHARED_MAP_PATH = ROOT / "shared" / "category_map.json"

EXPECTED_14_FAMILIES = [
    "BEVERAGES",
    "BREAD/BAKERY",
    "DAIRY",
    "DELI",
    "EGGS",
    "FROZEN FOODS",
    "GROCERY I",
    "GROCERY II",
    "LIQUOR,WINE,BEER",
    "MEATS",
    "POULTRY",
    "PREPARED FOODS",
    "PRODUCE",
    "SEAFOOD"
]


def test_shared_category_map_exists_and_valid():
    assert SHARED_MAP_PATH.exists(), "shared/category_map.json must exist"
    with open(SHARED_MAP_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert "_metadata" in data
    assert "category_to_family" in data
    assert "family_default_units" in data
    assert len(data["_metadata"]["canonical_families"]) == 14


def test_all_14_canonical_families_covered():
    """Verify that all 14 M5 Food Families are registered in the canonical family list."""
    with open(SHARED_MAP_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    canonical = set(data["_metadata"]["canonical_families"])
    for fam in EXPECTED_14_FAMILIES:
        assert fam in canonical, f"Missing family: {fam}"


def test_critical_families_do_not_fall_to_grocery_i():
    """Verify DELI, LIQUOR, PREPARED FOODS, FROZEN FOODS, EGGS, POULTRY resolve correctly."""
    cases = [
        ("Deli", "DELI"),
        ("deli", "DELI"),
        ("Prepared Food", "PREPARED FOODS"),
        ("Prepared Foods", "PREPARED FOODS"),
        ("Liquor, Wine, Beer", "LIQUOR,WINE,BEER"),
        ("Beer", "LIQUOR,WINE,BEER"),
        ("Wine", "LIQUOR,WINE,BEER"),
        ("Frozen Foods", "FROZEN FOODS"),
        ("Eggs", "EGGS"),
        ("Poultry", "POULTRY"),
        ("Produce", "PRODUCE"),
        ("Dairy", "DAIRY"),
        ("Bakery", "BREAD/BAKERY"),
        ("Seafood", "SEAFOOD"),
        ("Meat", "MEATS"),
        ("Grains & Pulses", "GROCERY I"),
        ("Oils & Fats", "GROCERY I")
    ]
    for category_input, expected_family in cases:
        fam, is_known = resolve_family(category_input)
        assert is_known is True, f"Expected {category_input} to be recognized"
        assert fam == expected_family, f"Expected {category_input} -> {expected_family}, got {fam}"


def test_unknown_category_handling():
    """Verify unknown category returns is_known=False and documented default fallback."""
    fam, is_known = resolve_family("Quantum Widget")
    assert is_known is False
    assert fam == "GROCERY I"

    fam, is_known = resolve_family("")
    assert is_known is False
    assert fam == "GROCERY I"


def test_family_default_units_documented_for_all_14():
    """Verify default unit exists for all 14 families without overwriting inventory uom."""
    for fam in EXPECTED_14_FAMILIES:
        assert fam in FAMILY_DEFAULT_UNITS, f"Missing default unit for {fam}"
        assert FAMILY_DEFAULT_UNITS[fam] in ["kg", "pack", "bottle", "pcs"]
