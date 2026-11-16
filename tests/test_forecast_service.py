import pytest
from unittest.mock import patch
import pandas as pd
from src.forecasting.forecast_service import (
    get_all_products_forecast,
    get_product_forecast,
    load_forecast,
    load_lots
)


def test_finding_7_preload_efficiency():
    """
    Finding #7:
    get_all_products_forecast(limit=100) must only call load_forecast() once
    and load_lots() once (O(1) disk reads instead of O(N)).
    """
    with patch("src.forecasting.forecast_service.load_forecast", wraps=load_forecast) as mock_fc, \
         patch("src.forecasting.forecast_service.load_lots", wraps=load_lots) as mock_lots:

        res = get_all_products_forecast(store_nbr=1, limit=50)

        assert res["status"] == "success"
        assert res["total_products"] > 0
        # Exactly 1 call to load_forecast and 1 call to load_lots
        assert mock_fc.call_count == 1, f"Expected 1 call to load_forecast, got {mock_fc.call_count}"
        assert mock_lots.call_count == 1, f"Expected 1 call to load_lots, got {mock_lots.call_count}"


def test_single_product_forecast_without_preload():
    """
    get_product_forecast must continue to work seamlessly when called directly
    without preloaded parameters (e.g. for /product/{name} single endpoint).
    """
    sample_prod = load_lots()["product_name"].iloc[0]
    res = get_product_forecast(sample_prod, store_nbr=1)
    assert res["status"] == "success"
    assert "points" in res
    assert len(res["points"]) == 3
    assert res["reorder_auto_po_allowed"] is False


def test_finding_1_and_10_metadata_contract():
    """
    Finding #1 and #10 Acceptance Criteria:
    API response must contain all mandatory metadata:
    - forecast_origin_date: '2017-08-15'
    - forecast_source: 'historical_static' or 'heuristic'
    - forecast_granularity: 'family_level_disaggregated'
    - disaggregation_method: 'stock_share'
    - sku_level_validated: False
    - forecast_validation_status: 'not_validated'
    - reorder_auto_po_allowed: False
    """
    res = get_all_products_forecast(store_nbr=1, limit=10)

    # Root metadata
    assert res["forecast_origin_date"] == "2017-08-15"
    assert res["forecast_source"] in ("historical_static", "heuristic")
    assert res["forecast_granularity"] == "family_level_disaggregated"
    assert res["disaggregation_method"] == "stock_share"
    assert res["sku_level_validated"] is False
    assert res["forecast_validation_status"] == "not_validated"
    assert res["reorder_auto_po_allowed"] is False
    assert "forecast_warning" in res

    # Per-product metadata
    first_prod = next(iter(res["products"].values()))
    assert first_prod["forecast_origin_date"] == "2017-08-15"
    assert first_prod["disaggregation_method"] == "stock_share"
    assert first_prod["sku_level_validated"] is False
    assert first_prod["reorder_auto_po_allowed"] is False


def test_empty_lots_handling():
    """
    Handling empty lots dataframe should not crash.
    """
    empty_df = pd.DataFrame(columns=["product_name", "category", "quantity", "days_to_expiry", "unit_price_myr", "uom"])
    with pytest.raises(ValueError, match="not found in store inventory"):
        get_product_forecast("Unknown Mango", store_nbr=1, preloaded_lots=empty_df)
