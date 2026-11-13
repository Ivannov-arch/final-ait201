"""
Unit Testing Suite — Rule Engine & Anti-Moral-Hazard Logic
==========================================================
Person 4: Business Logic & Cloud Database Specialist
Goal 6 Base+ — Step 1.3

Covers the 5 required standard test cases defined in
docs/BUSINESS_LOGIC_EXECUTION_PLAN_PERSON4.md § 1.3.

Run with:
    pytest tests/test_rule_engine.py -v
"""

import sys
import os

# Allow pytest to find src/ from project root regardless of CWD
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from src.engine.rule_engine import (
    assign_route,
    DONATION_QUOTA_CAP,
    MARKDOWN_AGGRESSIVE,
    MARKDOWN_TIERS,
    DONATION_CHANNEL,
)


# ===========================================================================
# Helpers
# ===========================================================================

def _route(result: dict) -> str:
    return result["recommended_route"]

def _discount(result: dict) -> float:
    return result["discount_percent"]

def _channel(result: dict) -> str:
    return result["channel"]

def _moral_hazard(result: dict) -> bool:
    return result["moral_hazard_flag"]

def _discounted_price(result: dict) -> float:
    return result["discounted_price_myr"]

def _expected_value(result: dict) -> float:
    return result["expected_value_myr"]


# ===========================================================================
# TEST CASE 1 — Healthy batch: Normal Sale, 0% discount
# ===========================================================================

class TestNormalSale:
    """
    Spec: Healthy batch with 10 days to expiry → Normal Sale, 0% discount.
    """

    def test_route_is_normal_sale(self):
        result = assign_route(
            days_to_expiry=10,
            quantity=100.0,
            demand_forecast_3d=50.0,
            unit_price_myr=25.00,
        )
        assert _route(result) == "Normal Sale", (
            f"Expected 'Normal Sale' for DTE=10, got '{_route(result)}'"
        )

    def test_no_discount_applied(self):
        result = assign_route(
            days_to_expiry=10,
            quantity=100.0,
            demand_forecast_3d=50.0,
            unit_price_myr=25.00,
        )
        assert _discount(result) == 0.0, (
            f"Expected 0% discount for Normal Sale, got {_discount(result)*100:.0f}%"
        )

    def test_price_unchanged(self):
        price = 25.00
        result = assign_route(
            days_to_expiry=10,
            quantity=100.0,
            demand_forecast_3d=50.0,
            unit_price_myr=price,
        )
        assert _discounted_price(result) == pytest.approx(price, rel=1e-4), (
            f"Full price RM {price} expected, got RM {_discounted_price(result)}"
        )

    def test_channel_is_retail(self):
        result = assign_route(
            days_to_expiry=10,
            quantity=100.0,
            demand_forecast_3d=50.0,
            unit_price_myr=25.00,
        )
        assert _channel(result) == "retail"

    def test_no_moral_hazard(self):
        result = assign_route(
            days_to_expiry=10,
            quantity=100.0,
            demand_forecast_3d=50.0,
            unit_price_myr=25.00,
        )
        assert _moral_hazard(result) is False

    def test_demand_exceeds_stock_forces_normal_sale(self):
        """Even with DTE=1, if demand >= quantity, it's Normal Sale (not surplus)."""
        result = assign_route(
            days_to_expiry=1,
            quantity=20.0,
            demand_forecast_3d=25.0,  # demand > quantity → not surplus
            unit_price_myr=15.00,
        )
        assert _route(result) == "Normal Sale"
        assert _discount(result) == 0.0

    @pytest.mark.parametrize("dte", [4, 7, 14, 30, 365])
    def test_various_safe_dte_values(self, dte):
        """Any DTE > 3 with surplus should be Normal Sale."""
        result = assign_route(
            days_to_expiry=dte,
            quantity=50.0,
            demand_forecast_3d=10.0,
            unit_price_myr=20.00,
        )
        assert _route(result) == "Normal Sale"


# ===========================================================================
# TEST CASE 2 — Near-expiry batch: Dynamic Markdown, 15–40% discount
# ===========================================================================

class TestDynamicMarkdown:
    """
    Spec: Near-expiry batch (1 < DTE ≤ 3) → Dynamic Markdown (15–40% discount).
    """

    @pytest.mark.parametrize("dte,expected_discount", [
        (3, MARKDOWN_TIERS[3]),   # 15%
        (2, MARKDOWN_TIERS[2]),   # 25%
    ])
    def test_tiered_discount_rate(self, dte, expected_discount):
        result = assign_route(
            days_to_expiry=dte,
            quantity=60.0,
            demand_forecast_3d=5.0,   # surplus
            unit_price_myr=40.00,
        )
        assert _route(result) == "Dynamic Markdown", (
            f"DTE={dte} should be 'Dynamic Markdown', got '{_route(result)}'"
        )
        assert _discount(result) == pytest.approx(expected_discount, rel=1e-4), (
            f"DTE={dte}: expected discount {expected_discount*100:.0f}%, "
            f"got {_discount(result)*100:.0f}%"
        )

    def test_discount_is_within_15_to_40_percent(self):
        """All markdown discounts must stay in the 15–40% corridor."""
        for dte in [2, 3]:
            result = assign_route(
                days_to_expiry=dte,
                quantity=60.0,
                demand_forecast_3d=5.0,
                unit_price_myr=40.00,
            )
            discount_pct = _discount(result) * 100
            assert 15.0 <= discount_pct <= 40.0, (
                f"DTE={dte}: discount {discount_pct:.1f}% outside 15–40% corridor"
            )

    def test_discounted_price_is_lower_than_full_price(self):
        price = 40.00
        result = assign_route(
            days_to_expiry=2,
            quantity=60.0,
            demand_forecast_3d=5.0,
            unit_price_myr=price,
        )
        assert _discounted_price(result) < price, (
            f"Discounted price RM {_discounted_price(result)} should be less than "
            f"full price RM {price}"
        )

    def test_channel_is_retail_for_markdown(self):
        """Markdown lots stay on retail shelves, not donated."""
        result = assign_route(
            days_to_expiry=2,
            quantity=60.0,
            demand_forecast_3d=5.0,
            unit_price_myr=40.00,
        )
        assert _channel(result) == "retail"

    def test_expected_value_is_positive(self):
        result = assign_route(
            days_to_expiry=3,
            quantity=60.0,
            demand_forecast_3d=5.0,
            unit_price_myr=40.00,
        )
        assert _expected_value(result) > 0.0

    def test_discounted_price_calculation_dte3(self):
        """RM 40.00 × (1 − 15%) = RM 34.00"""
        result = assign_route(
            days_to_expiry=3,
            quantity=60.0,
            demand_forecast_3d=5.0,
            unit_price_myr=40.00,
        )
        assert _discounted_price(result) == pytest.approx(40.00 * 0.85, rel=1e-4)

    def test_discounted_price_calculation_dte2(self):
        """RM 40.00 × (1 − 25%) = RM 30.00"""
        result = assign_route(
            days_to_expiry=2,
            quantity=60.0,
            demand_forecast_3d=5.0,
            unit_price_myr=40.00,
        )
        assert _discounted_price(result) == pytest.approx(40.00 * 0.75, rel=1e-4)


# ===========================================================================
# TEST CASE 3 — Critical batch (DTE ≤ 1) with quota available → Donation
# ===========================================================================

class TestDonationWithQuotaAvailable:
    """
    Spec: Critical batch (1 day left) with quota available
          → Donation to closed NGO channel.
    """

    def test_route_is_donation(self):
        result = assign_route(
            days_to_expiry=1,
            quantity=30.0,
            demand_forecast_3d=5.0,
            unit_price_myr=20.00,
            total_surplus_volume=200.0,
            cumulative_donated_volume=20.0,   # 20 of 60 max → quota open
        )
        assert _route(result) == "Donation", (
            f"Expected 'Donation' when quota is open, got '{_route(result)}'"
        )

    def test_channel_is_closed_ngo(self):
        """Anti-moral-hazard: donations must NEVER be on retail shelves."""
        result = assign_route(
            days_to_expiry=1,
            quantity=30.0,
            demand_forecast_3d=5.0,
            unit_price_myr=20.00,
            total_surplus_volume=200.0,
            cumulative_donated_volume=20.0,
        )
        assert _channel(result) == DONATION_CHANNEL, (
            f"Expected channel='{DONATION_CHANNEL}', got '{_channel(result)}'. "
            f"Donations must be segregated to closed NGO channel."
        )

    def test_no_moral_hazard_flag(self):
        result = assign_route(
            days_to_expiry=1,
            quantity=30.0,
            demand_forecast_3d=5.0,
            unit_price_myr=20.00,
            total_surplus_volume=200.0,
            cumulative_donated_volume=20.0,
        )
        assert _moral_hazard(result) is False

    def test_expected_value_is_zero_for_donation(self):
        """Donated lots have zero commercial revenue."""
        result = assign_route(
            days_to_expiry=1,
            quantity=30.0,
            demand_forecast_3d=5.0,
            unit_price_myr=20.00,
            total_surplus_volume=200.0,
            cumulative_donated_volume=20.0,
        )
        assert _expected_value(result) == 0.0, (
            f"Donation lots should have RM 0.00 expected value, "
            f"got RM {_expected_value(result):.2f}"
        )

    def test_donation_also_triggers_on_dte_zero(self):
        """DTE=0 (already expired on the day) should also route to Donation."""
        result = assign_route(
            days_to_expiry=0,
            quantity=10.0,
            demand_forecast_3d=0.0,
            unit_price_myr=15.00,
        )
        assert _route(result) == "Donation"
        assert _channel(result) == DONATION_CHANNEL


# ===========================================================================
# TEST CASE 4 — Critical batch exceeding 30% donation quota → Markdown redirect
# ===========================================================================

class TestDonationQuotaBreach:
    """
    Spec: Critical batch (1 day left) exceeding 30% surplus quota
          → redirected to aggressive clearance markdown.
    """

    def test_route_redirected_to_markdown(self):
        """
        total_surplus=100 → cap=30 units.
        cumulative already donated=50 → quota exceeded.
        Adding qty=20 would reach 70 → still over cap.
        """
        result = assign_route(
            days_to_expiry=1,
            quantity=20.0,
            demand_forecast_3d=5.0,
            unit_price_myr=25.00,
            total_surplus_volume=100.0,
            cumulative_donated_volume=50.0,   # 50 > cap of 30 → breached
        )
        assert _route(result) == "Dynamic Markdown", (
            f"Expected markdown redirect when quota exceeded, got '{_route(result)}'"
        )

    def test_moral_hazard_flag_raised(self):
        result = assign_route(
            days_to_expiry=1,
            quantity=20.0,
            demand_forecast_3d=5.0,
            unit_price_myr=25.00,
            total_surplus_volume=100.0,
            cumulative_donated_volume=50.0,
        )
        assert _moral_hazard(result) is True, (
            "moral_hazard_flag must be True when donation quota is breached."
        )

    def test_aggressive_markdown_rate_applied(self):
        """When quota breached, discount must equal MARKDOWN_AGGRESSIVE (50%)."""
        result = assign_route(
            days_to_expiry=1,
            quantity=20.0,
            demand_forecast_3d=5.0,
            unit_price_myr=25.00,
            total_surplus_volume=100.0,
            cumulative_donated_volume=50.0,
        )
        assert _discount(result) == pytest.approx(MARKDOWN_AGGRESSIVE, rel=1e-4), (
            f"Expected aggressive markdown of {MARKDOWN_AGGRESSIVE*100:.0f}%, "
            f"got {_discount(result)*100:.0f}%"
        )

    def test_channel_stays_retail_on_redirect(self):
        """Redirected lot should NOT go to closed_ngo — it stays on retail shelves."""
        result = assign_route(
            days_to_expiry=1,
            quantity=20.0,
            demand_forecast_3d=5.0,
            unit_price_myr=25.00,
            total_surplus_volume=100.0,
            cumulative_donated_volume=50.0,
        )
        assert _channel(result) == "retail", (
            f"Redirected lots must stay on 'retail' channel, got '{_channel(result)}'"
        )

    def test_quota_exactly_at_30_percent_still_allowed(self):
        """
        Adding qty that lands exactly at the 30% cap should still be allowed
        (boundary: cumulative + qty == cap is not a breach).
        total=100 → cap=30. cumulative=0, qty=30 → 0+30 <= 30 → OK.
        """
        result = assign_route(
            days_to_expiry=1,
            quantity=30.0,
            demand_forecast_3d=5.0,
            unit_price_myr=25.00,
            total_surplus_volume=100.0,
            cumulative_donated_volume=0.0,
        )
        assert _route(result) == "Donation"
        assert _moral_hazard(result) is False

    def test_quota_one_unit_over_cap_triggers_redirect(self):
        """cumulative=0, qty=31 → 31 > 30 → breach."""
        result = assign_route(
            days_to_expiry=1,
            quantity=31.0,
            demand_forecast_3d=5.0,
            unit_price_myr=25.00,
            total_surplus_volume=100.0,
            cumulative_donated_volume=0.0,
        )
        assert _route(result) == "Dynamic Markdown"
        assert _moral_hazard(result) is True


# ===========================================================================
# TEST CASE 5 — Defensive fallback: zero and negative DTE
# ===========================================================================

class TestDefensiveFallback:
    """
    Spec: Negative or zero days to expiry → safe, defined handling (no crashes).
    """

    @pytest.mark.parametrize("dte", [0, -1, -5, -100])
    def test_zero_and_negative_dte_do_not_crash(self, dte):
        """Must return a valid result dict for any DTE including negative."""
        result = assign_route(
            days_to_expiry=dte,
            quantity=50.0,
            demand_forecast_3d=0.0,
            unit_price_myr=20.00,
        )
        assert isinstance(result, dict)
        assert "recommended_route" in result
        assert "discount_percent" in result

    @pytest.mark.parametrize("dte", [0, -1, -5])
    def test_expired_lot_routes_to_donation(self, dte):
        """Expired lots (DTE ≤ 0) should be treated same as DTE=0 → Donation."""
        result = assign_route(
            days_to_expiry=dte,
            quantity=50.0,
            demand_forecast_3d=0.0,
            unit_price_myr=20.00,
        )
        # Expired stock cannot be sold — should donate or aggressively clear
        assert _route(result) in ("Donation", "Dynamic Markdown"), (
            f"DTE={dte}: expired stock should not be 'Normal Sale', "
            f"got '{_route(result)}'"
        )

    def test_zero_quantity_does_not_crash(self):
        result = assign_route(
            days_to_expiry=1,
            quantity=0.0,
            demand_forecast_3d=0.0,
            unit_price_myr=20.00,
        )
        assert isinstance(result, dict)

    def test_zero_price_does_not_crash(self):
        result = assign_route(
            days_to_expiry=5,
            quantity=50.0,
            demand_forecast_3d=10.0,
            unit_price_myr=0.0,
        )
        assert isinstance(result, dict)
        assert _discounted_price(result) >= 0.0

    def test_all_result_keys_present(self):
        """Every result must expose all documented API keys."""
        required_keys = {
            "recommended_route",
            "discount_percent",
            "discounted_price_myr",
            "expected_value_myr",
            "channel",
            "moral_hazard_flag",
            "reason",
        }
        result = assign_route(
            days_to_expiry=0,
            quantity=20.0,
            demand_forecast_3d=0.0,
            unit_price_myr=15.00,
        )
        missing = required_keys - result.keys()
        assert not missing, f"Missing result keys: {missing}"

    def test_reason_is_non_empty_string(self):
        """Every decision must include a human-readable reason."""
        for dte in [10, 2, 1, 0, -3]:
            result = assign_route(
                days_to_expiry=dte,
                quantity=30.0,
                demand_forecast_3d=5.0,
                unit_price_myr=20.00,
            )
            assert isinstance(result["reason"], str)
            assert len(result["reason"]) > 0, f"DTE={dte}: reason string is empty"


# ===========================================================================
# BONUS — Integration: evaluate_lot_dataframe produces required columns
# ===========================================================================

class TestBulkEvaluator:
    """Verify that evaluate_lot_dataframe() outputs the required enriched columns."""

    @pytest.fixture
    def sample_df(self):
        import pandas as pd
        return pd.DataFrame([
            {"lot_id": "T-001", "product_name": "Apple",   "category": "Produce",
             "quantity": 100, "expiry_date": "2026-11-23", "unit_price_myr": 10.00,
             "store_id": "MY-KL-001", "date_received": "2026-11-13",
             "shelf_life_days": 10, "days_to_expiry": 10,
             "turnover_ratio": 60.0, "stock_pressure": 1.0, "reorder_level": 50},
            {"lot_id": "T-002", "product_name": "Banana",  "category": "Produce",
             "quantity": 80,  "expiry_date": "2026-11-15", "unit_price_myr": 8.00,
             "store_id": "MY-KL-001", "date_received": "2026-11-13",
             "shelf_life_days": 2, "days_to_expiry": 2,
             "turnover_ratio": 50.0, "stock_pressure": 0.8, "reorder_level": 40},
            {"lot_id": "T-003", "product_name": "Mango",   "category": "Produce",
             "quantity": 30,  "expiry_date": "2026-11-14", "unit_price_myr": 15.00,
             "store_id": "MY-KL-001", "date_received": "2026-11-13",
             "shelf_life_days": 1, "days_to_expiry": 1,
             "turnover_ratio": 70.0, "stock_pressure": 1.2, "reorder_level": 20},
        ])

    def test_required_columns_present(self, sample_df):
        from src.engine.rule_engine import evaluate_lot_dataframe
        result = evaluate_lot_dataframe(sample_df)
        for col in ["recommended_route", "discount_percent",
                    "discounted_price_myr", "moral_hazard_flag"]:
            assert col in result.columns, f"Column '{col}' missing from output"

    def test_row_count_unchanged(self, sample_df):
        from src.engine.rule_engine import evaluate_lot_dataframe
        result = evaluate_lot_dataframe(sample_df)
        assert len(result) == len(sample_df)

    def test_route_values_are_valid(self, sample_df):
        from src.engine.rule_engine import evaluate_lot_dataframe
        result = evaluate_lot_dataframe(sample_df)
        valid_routes = {"Normal Sale", "Dynamic Markdown", "Donation"}
        invalid = set(result["recommended_route"].unique()) - valid_routes
        assert not invalid, f"Invalid route values found: {invalid}"

    def test_discount_percent_range(self, sample_df):
        from src.engine.rule_engine import evaluate_lot_dataframe
        result = evaluate_lot_dataframe(sample_df)
        assert result["discount_percent"].between(0.0, 1.0).all(), (
            "discount_percent must always be in [0.0, 1.0]"
        )

