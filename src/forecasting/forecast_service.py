
import pandas as pd
import json

from pathlib import Path

# ==========================================
# 1. PROJECT PATHS
# ==========================================

ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = ROOT / "data" / "processed"

CSV_PATH = DATA_PATH / "three_day_forecast.csv"
JSON_PATH = DATA_PATH / "three_day_forecast.json"


# ==========================================
# 2. LOAD FORECAST DATA
# ==========================================

def load_forecast():

    if not JSON_PATH.exists():
        raise FileNotFoundError(
            "Forecast JSON not found. "
            "Run forecast_future.py first."
        )

    with open(JSON_PATH, "r", encoding="utf-8") as file:
        forecasts = json.load(file)

    return forecasts


# ==========================================
# 3. GET ALL THREE-DAY FORECASTS
# ==========================================

def get_three_day_forecast():

    forecasts = load_forecast()

    return {
        "status": "success",
        "total_records": len(forecasts),
        "forecast": forecasts
    }


# ==========================================
# 4. GET FORECAST BY HORIZON
# ==========================================

def get_forecast_by_horizon(horizon):

    if horizon not in [1, 2, 3]:
        raise ValueError(
            "Horizon must be 1, 2 or 3."
        )

    forecasts = load_forecast()

    filtered = [
        item for item in forecasts
        if item["horizon"] == horizon
    ]

    return {
        "status": "success",
        "horizon": horizon,
        "total_records": len(filtered),
        "forecast": filtered
    }


# ==========================================
# 5. GET FORECAST BY STORE
# ==========================================

def get_forecast_by_store(store_nbr):

    forecasts = load_forecast()

    filtered = [
        item for item in forecasts
        if item["store_nbr"] == store_nbr
    ]

    return {
        "status": "success",
        "store_nbr": store_nbr,
        "total_records": len(filtered),
        "forecast": filtered
    }


# ==========================================
# 6. TEST SERVICE
# ==========================================

if __name__ == "__main__":

    result = get_three_day_forecast()

    print("\n========== FORECAST SERVICE TEST ==========")

    print("Status:", result["status"])
    print("Total records:", result["total_records"])

    print("\nSample records:")

    for item in result["forecast"][:5]:
        print(item)

    print("\n========== SERVICE TEST COMPLETED ==========")
