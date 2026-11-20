import pandas as pd
import json
import os
import urllib.request
from pathlib import Path
from datetime import datetime, timedelta, timezone

# ==========================================
# 1. PROJECT PATHS
# ==========================================

ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = ROOT / "data" / "processed"

CSV_PATH = DATA_PATH / "three_day_forecast.csv"
JSON_PATH = DATA_PATH / "three_day_forecast.json"
INVENTORY_MASTER_PATH = DATA_PATH / "inventory_master.csv"
LOTS_PATH = INVENTORY_MASTER_PATH

# Category mapping: loaded from shared/category_map.json (unified across Python & JS)
SHARED_MAP_PATH = ROOT / "shared" / "category_map.json"

def _load_shared_map():
    if SHARED_MAP_PATH.exists():
        try:
            with open(SHARED_MAP_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

_SHARED_DATA = _load_shared_map()
CATEGORY_MAP = _SHARED_DATA.get("category_to_family", {
    "Produce": "PRODUCE",
    "Fruits & Vegetables": "PRODUCE",
    "Dairy": "DAIRY",
    "Bakery": "BREAD/BAKERY",
    "Beverages": "BEVERAGES",
    "Seafood": "SEAFOOD",
    "Meat": "MEATS",
    "Meats": "MEATS",
    "Poultry": "POULTRY",
    "Eggs": "EGGS",
    "Frozen Foods": "FROZEN FOODS",
    "Deli": "DELI",
    "Prepared Food": "PREPARED FOODS",
    "Prepared Foods": "PREPARED FOODS",
    "Liquor, Wine, Beer": "LIQUOR,WINE,BEER",
    "Grains & Pulses": "GROCERY I",
    "Oils & Fats": "GROCERY I",
    "Grocery": "GROCERY I"
})

FAMILY_DEFAULT_UNITS = _SHARED_DATA.get("family_default_units", {
    "PRODUCE": "kg",
    "BREAD/BAKERY": "pack",
    "DAIRY": "pack",
    "DELI": "kg",
    "EGGS": "pack",
    "FROZEN FOODS": "pack",
    "GROCERY I": "pack",
    "GROCERY II": "pack",
    "LIQUOR,WINE,BEER": "bottle",
    "MEATS": "kg",
    "POULTRY": "kg",
    "PREPARED FOODS": "pack",
    "SEAFOOD": "kg",
    "BEVERAGES": "bottle"
})

UNIT_MAP = FAMILY_DEFAULT_UNITS

def resolve_family(category: str) -> tuple[str, bool]:
    """Resolves retail category to one of 14 canonical families. Returns (family, is_known)."""
    c = str(category or "").strip()
    if c in CATEGORY_MAP:
        return CATEGORY_MAP[c], True
    for k, v in CATEGORY_MAP.items():
        if k.lower() == c.lower():
            return v, True
    return "GROCERY I", False

# ==========================================
# 2. LOAD FORECAST DATA
# ==========================================

def load_forecast():
    if not JSON_PATH.exists():
        raise FileNotFoundError(
            "Forecast JSON not found. Run forecast_future.py first."
        )

    with open(JSON_PATH, "r", encoding="utf-8") as file:
        forecasts = json.load(file)

    return forecasts


def _get_env_var(name: str) -> str:
    val = os.getenv(name)
    if val:
        return val
    for env_path in (ROOT / ".env", ROOT / "frontend" / ".env"):
        if env_path.exists():
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.startswith(f"{name}="):
                            return line.split("=", 1)[1].strip().strip('"').strip("'")
            except Exception:
                pass
    return ""


def load_lots() -> pd.DataFrame:
    """
    Loads active inventory lots for forecast disaggregation.
    Connects to Supabase Cloud live batches table first (BUG-FC-07 & BUG-FC-01 fix).
    Falls back gracefully to inventory_master.json, then inventory_master.csv.
    """
    supabase_url = _get_env_var("VITE_SUPABASE_URL") or _get_env_var("SUPABASE_URL")
    supabase_key = _get_env_var("SUPABASE_SERVICE_ROLE_KEY") or _get_env_var("VITE_SUPABASE_ANON_KEY")

    if supabase_url and supabase_key:
        try:
            req = urllib.request.Request(
                f"{supabase_url}/rest/v1/batches?select=*&quantity=gt.0",
                headers={
                    "apikey": supabase_key,
                    "Authorization": f"Bearer {supabase_key}"
                }
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode("utf-8"))
                    if isinstance(data, list) and len(data) > 0:
                        df = pd.DataFrame(data)
                        if "batch_id" in df.columns and "lot_id" not in df.columns:
                            df["lot_id"] = df["batch_id"]
                        return df
        except Exception:
            pass

    # Fallback 1: live application JSON
    json_master = DATA_PATH / "inventory_master.json"
    if json_master.exists():
        try:
            with open(json_master, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list) and len(data) > 0:
                    df = pd.DataFrame(data)
                    return df
        except Exception:
            pass

    # Fallback 2: static CSV
    if LOTS_PATH.exists():
        return pd.read_csv(LOTS_PATH)

    raise FileNotFoundError(f"Inventory lots file not found at {LOTS_PATH}")


# ==========================================
# 3. GET RAW FORECASTS (PERSON 2 BASELINE)
# ==========================================

def get_three_day_forecast():
    forecasts = load_forecast()
    return {
        "status": "success",
        "total_records": len(forecasts),
        "forecast": forecasts
    }


def get_forecast_by_horizon(horizon):
    if horizon not in [1, 2, 3]:
        raise ValueError("Horizon must be 1, 2 or 3.")

    forecasts = load_forecast()
    filtered = [item for item in forecasts if item["horizon"] == horizon]

    return {
        "status": "success",
        "horizon": horizon,
        "total_records": len(filtered),
        "forecast": filtered
    }


def get_forecast_by_store(store_nbr):
    forecasts = load_forecast()
    filtered = [item for item in forecasts if item["store_nbr"] == store_nbr]

    return {
        "status": "success",
        "store_nbr": store_nbr,
        "total_records": len(filtered),
        "forecast": filtered
    }


# ==========================================
# 4. DISAGGREGATION: PRODUCT & BATCH FORECAST
# ==========================================

def _build_forecast_lookup(store_nbr=1):
    forecasts = load_forecast()
    lookup = {}
    for item in forecasts:
        if item["store_nbr"] == store_nbr:
            family = item["family"]
            horizon = item["horizon"]
            lookup.setdefault(family, {})[horizon] = float(item["predicted_demand"])
    return lookup


def get_product_forecast(
    product_name: str,
    store_nbr: int = 1,
    preloaded_lots: pd.DataFrame | None = None,
    preloaded_lookup: dict | None = None
):
    lots = preloaded_lots if preloaded_lots is not None else load_lots()
    product_rows = lots[lots["product_name"].str.lower() == product_name.strip().lower()]

    if product_rows.empty:
        matches = lots[lots["product_name"].str.contains(product_name.strip(), case=False, na=False)]
        if not matches.empty:
            product_rows = matches
        else:
            raise ValueError(f"Product '{product_name}' not found in store inventory.")

    exact_name = product_rows["product_name"].iloc[0]
    category = product_rows["category"].iloc[0] if "category" in product_rows else "Produce"

    # Resolve ML family from shared mapping
    ml_family, is_known_family = resolve_family(category)

    # Unit: preserve actual inventory UOM first, fallback to family default unit
    actual_uom = product_rows["uom"].iloc[0] if ("uom" in product_rows and pd.notna(product_rows["uom"].iloc[0])) else None
    unit = str(actual_uom).strip() if actual_uom else FAMILY_DEFAULT_UNITS.get(ml_family, "units")

    total_product_stock = int(product_rows["quantity"].sum())
    min_dte = int(product_rows["days_to_expiry"].min()) if "days_to_expiry" in product_rows else 3
    unit_price = float(product_rows["unit_price_myr"].iloc[0]) if "unit_price_myr" in product_rows else 6.0

    # Total category stock for disaggregation weight
    category_rows = lots[lots["category"] == category] if "category" in lots.columns else product_rows
    total_cat_stock = max(1, int(category_rows["quantity"].sum()))
    weight = total_product_stock / total_cat_stock

    # Get family forecast lookup (O(1) if preloaded)
    lookup = preloaded_lookup if preloaded_lookup is not None else _build_forecast_lookup(store_nbr)
    has_family_forecast = ml_family in lookup
    family_forecasts = lookup.get(ml_family, {1: 50.0, 2: 45.0, 3: 40.0})

    # Historical origin date from 11_food_waste / M5 Kaggle dataset
    origin_date = "2017-08-15"
    forecast_source = "historical_static" if (is_known_family and has_family_forecast) else "heuristic"
    forecast_method = "lightgbm" if (is_known_family and has_family_forecast) else None

    # Generate projections per horizon
    labels = ["Horizon +1", "Horizon +2", "Horizon +3"]
    target_dates = ["2017-08-16", "2017-08-17", "2017-08-18"]
    points = []
    current_rem = total_product_stock
    total_demand = 0

    is_expired = min_dte < 0

    for idx, h in enumerate([1, 2, 3]):
        raw_dem = max(0.0, float(family_forecasts.get(h, 45.0))) * weight
        dem = 0 if is_expired else max(1, round(raw_dem))
        total_demand += dem

        rem = 0 if is_expired else max(0, current_rem - dem)
        deficit = 0 if is_expired else (dem - current_rem if current_rem < dem else 0)
        current_rem = rem

        if is_expired:
            status = "Quarantined — Disposal Required"
        elif rem > 20:
            status = "Sufficient Stock"
        elif rem > 0:
            status = "Stock Running Low"
        else:
            status = "Out of Stock — Reorder Needed"

        points.append({
            "horizon": h,
            "label": labels[idx],
            "date": f"Day +{h}",
            "historical_target_date": target_dates[idx],
            "demand": dem,
            "stockRemaining": rem,
            "stockDeficit": deficit,
            "status": status
        })

    # Recommended action (advisory only)
    if is_expired:
        reorder_needed = False
        reorder_qty = 0
        surplus_qty = 0
        recommended_action = "Quarantine & Disposal Required"
        action_reason = f"Sale Prohibited: Batch is expired ({abs(min_dte)}d ago). Food safety regulations require immediate transfer to quarantine and bio-waste disposal."
    else:
        reorder_needed = current_rem == 0 and total_demand > total_product_stock
        reorder_qty = (total_demand - total_product_stock) if reorder_needed else 0
        surplus_qty = max(0, total_product_stock - total_demand)

        if surplus_qty > 0 and min_dte <= 1:
            recommended_action = "Donate to Food Bank"
            action_reason = f"Advisory: Surplus of {surplus_qty} {unit} with critical shelf life (DTE {min_dte}d). Route to local food bank to prevent waste."
        elif surplus_qty > 0 and min_dte <= 3:
            recommended_action = "Dynamic Markdown"
            action_reason = f"Advisory: Surplus of {surplus_qty} {unit} with approaching expiry (DTE {min_dte}d). Apply markdown to accelerate retail velocity."
        else:
            recommended_action = "Normal Sale"
            action_reason = f"Advisory: Stock velocity balanced. Shelf life (DTE {min_dte}d) is safe for standard retail pricing."

    return {
        "status": "success",
        "product": exact_name,
        "category": category,
        "unit": unit,
        "unitPrice": unit_price,
        "currentStock": total_product_stock,
        "daysToExpiry": min_dte,
        "totalDemand": total_demand,
        "surplusQty": surplus_qty,
        "reorderNeeded": reorder_needed,
        "reorderQty": reorder_qty,
        "recommendedAction": recommended_action,
        "actionReason": action_reason,
        "mlFamily": ml_family,
        "mlFamilyKnown": is_known_family,
        "mlWeight": round(weight, 4),
        "forecast_origin_date": origin_date,
        "forecast_source": forecast_source,
        "forecast_method": forecast_method,
        "forecast_granularity": "family_level_disaggregated",
        "forecast_disaggregation_method": "stock_share",
        "disaggregation_method": "stock_share",
        "sku_level_validated": False,
        "reorder_auto_po_allowed": False,
        "forecast_validation_status": "not_validated",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "points": points
    }


def get_all_products_forecast(store_nbr: int = 1, limit: int = 100):
    lots = load_lots()
    lookup = _build_forecast_lookup(store_nbr)

    # Group by product, pick top products by quantity
    top_products = (
        lots.groupby("product_name")["quantity"]
        .sum()
        .sort_values(ascending=False)
        .head(limit)
        .index.tolist()
    )

    results = {}
    for prod in top_products:
        try:
            results[prod] = get_product_forecast(
                prod,
                store_nbr=store_nbr,
                preloaded_lots=lots,
                preloaded_lookup=lookup
            )
        except Exception:
            continue

    return {
        "status": "success",
        "store_nbr": store_nbr,
        "total_products": len(results),
        "forecast_origin_date": "2017-08-15",
        "forecast_source": "historical_static",
        "forecast_method": "lightgbm",
        "forecast_granularity": "family_level_disaggregated",
        "forecast_disaggregation_method": "stock_share",
        "disaggregation_method": "stock_share",
        "sku_level_validated": False,
        "reorder_auto_po_allowed": False,
        "forecast_validation_status": "not_validated",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "forecast_warning": "Historical Kaggle dataset ending 2017-08-15. Disaggregated from family-level forecast by stock share. Advisory only — not validated for automated PO or business commitment.",
        "products": results
    }
