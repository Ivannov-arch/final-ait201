import pandas as pd
import json
import os
import urllib.request
from pathlib import Path
from datetime import datetime, timedelta

# ==========================================
# 1. PROJECT PATHS
# ==========================================

ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = ROOT / "data" / "processed"

CSV_PATH = DATA_PATH / "three_day_forecast.csv"
JSON_PATH = DATA_PATH / "three_day_forecast.json"
INVENTORY_MASTER_PATH = DATA_PATH / "inventory_master.csv"
LOTS_PATH = INVENTORY_MASTER_PATH

# Category mapping: lots_base.csv -> 14 ML Model Families
CATEGORY_MAP = {
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
    "Grains & Pulses": "GROCERY I",
    "Oils & Fats": "GROCERY I",
    "Grocery": "GROCERY I"
}

UNIT_MAP = {
    "Produce": "kg",
    "Fruits & Vegetables": "kg",
    "Dairy": "pack",
    "Bakery": "pcs",
    "Beverages": "bottle",
    "Seafood": "kg",
    "Meat": "kg",
    "Meats": "kg",
    "Grains & Pulses": "pack",
    "Oils & Fats": "bottle"
}

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
    if os.getenv(name):
        return os.getenv(name)
    env_file = ROOT / ".env"
    if env_file.exists():
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    if line.startswith(f"{name}="):
                        return line.split("=", 1)[1].strip().strip('"').strip("'")
        except Exception:
            pass
    fe_env = ROOT / "frontend" / ".env"
    if fe_env.exists():
        try:
            with open(fe_env, "r", encoding="utf-8") as f:
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


def get_product_forecast(product_name: str, store_nbr: int = 1):
    lots = load_lots()
    product_rows = lots[lots["product_name"].str.lower() == product_name.strip().lower()]

    if product_rows.empty:
        # Fallback to closest match
        matches = lots[lots["product_name"].str.contains(product_name.strip(), case=False, na=False)]
        if not matches.empty:
            product_rows = matches
        else:
            raise ValueError(f"Product '{product_name}' not found in store inventory.")

    exact_name = product_rows["product_name"].iloc[0]
    category = product_rows["category"].iloc[0]
    unit = UNIT_MAP.get(category, "units")
    total_product_stock = int(product_rows["quantity"].sum())
    min_dte = int(product_rows["days_to_expiry"].min()) if "days_to_expiry" in product_rows else 3

    # Total category stock for disaggregation weight
    category_rows = lots[lots["category"] == category]
    total_cat_stock = max(1, int(category_rows["quantity"].sum()))
    weight = total_product_stock / total_cat_stock

    # Get ML family forecast
    ml_family = CATEGORY_MAP.get(category, "GROCERY I")
    lookup = _build_forecast_lookup(store_nbr)
    family_forecasts = lookup.get(ml_family, {1: 100.0, 2: 90.0, 3: 85.0})

    # Generate daily projections
    today = datetime.now()
    labels = ["Tomorrow", "Day After Tomorrow", "Day 3"]
    points = []
    current_rem = total_product_stock
    total_demand = 0

    for h in [1, 2, 3]:
        raw_dem = family_forecasts.get(h, 50.0) * weight
        # Ensure realistic scale
        dem = max(1, round(raw_dem))
        total_demand += dem

        rem = max(0, current_rem - dem)
        deficit = dem - current_rem if current_rem < dem else 0
        current_rem = rem

        target_dt = today + timedelta(days=h)
        date_str = target_dt.strftime("%b %d")

        if rem > 20:
            status = "Sufficient Stock"
        elif rem > 0:
            status = "Stock Running Low"
        else:
            status = "Out of Stock — Reorder Needed"

        points.append({
            "label": labels[h - 1],
            "date": date_str,
            "demand": dem,
            "stockRemaining": rem,
            "stockDeficit": deficit,
            "status": status
        })

    # Determine recommended business action
    reorder_needed = current_rem == 0 and total_demand > total_product_stock
    reorder_qty = (total_demand - total_product_stock) if reorder_needed else 0
    surplus_qty = max(0, total_product_stock - total_demand)

    if surplus_qty > 0 and min_dte <= 1:
        recommended_action = "Donate to Food Bank"
        action_reason = f"Surplus of {surplus_qty} {unit} with critical shelf life (DTE {min_dte}d). Route to local food bank to prevent waste."
    elif surplus_qty > 0 and min_dte <= 3:
        recommended_action = "Dynamic Markdown"
        action_reason = f"Surplus of {surplus_qty} {unit} with approaching expiry (DTE {min_dte}d). Apply 30% discount to accelerate retail velocity."
    else:
        recommended_action = "Normal Sale"
        action_reason = f"Stock balanced against projected velocity. Shelf life (DTE {min_dte}d) is healthy for standard retail pricing."

    return {
        "status": "success",
        "product": exact_name,
        "category": category,
        "unit": unit,
        "currentStock": total_product_stock,
        "maxScale": max(int(total_product_stock * 1.3), int(total_demand * 1.3), 100),
        "daysToExpiry": min_dte,
        "totalDemand": total_demand,
        "surplusQty": surplus_qty,
        "reorderNeeded": reorder_needed,
        "reorderQty": reorder_qty,
        "recommendedAction": recommended_action,
        "actionReason": action_reason,
        "points": points
    }


def get_all_products_forecast(store_nbr: int = 1, limit: int = 100):
    lots = load_lots()
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
            results[prod] = get_product_forecast(prod, store_nbr)
        except Exception:
            continue

    return {
        "status": "success",
        "store_nbr": store_nbr,
        "total_products": len(results),
        "products": results
    }
