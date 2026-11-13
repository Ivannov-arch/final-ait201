import pandas as pd
import joblib
import json

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

DATA = ROOT / "data" / "processed"
MODELS = ROOT / "models"

# Check actual dataset categories
df = pd.read_csv(
    DATA / "8_m5_train_food_cleaned.csv"
)

dataset_categories = sorted(df["family"].unique())

print("\n========== DATASET CATEGORIES ==========")

for category in dataset_categories:
    print(repr(category))

# Check model categories
for horizon in [1, 2, 3]:

    artifact = joblib.load(
        MODELS / f"demand_forecast_final_day_{horizon}.pkl"
    )

    print(f"\n========== MODEL DAY +{horizon} ==========")

    model_categories = artifact["family_categories"]

    for category in model_categories:
        print(repr(category))

    print(
        "Categories match:",
        set(dataset_categories) == set(model_categories)
    )

# Check forecast output
with open(
    DATA / "three_day_forecast.json",
    "r",
    encoding="utf-8"
) as file:

    forecasts = json.load(file)

print("\n========== FORECAST OUTPUT ==========")

print("Total records:", len(forecasts))

print(
    "Forecast origin:",
    forecasts[0]["forecast_origin_date"]
)

print(
    "Food families:",
    len(set(x["family"] for x in forecasts))
)

print(
    "Stores:",
    len(set(x["store_nbr"] for x in forecasts))
)

print("\nINTEGRATION CHECK COMPLETED")