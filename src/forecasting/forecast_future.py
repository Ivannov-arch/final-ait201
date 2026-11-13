
import pandas as pd
import numpy as np
import joblib

from pathlib import Path

# =====================================================
# 1. PROJECT PATHS
# =====================================================

ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = (
    ROOT / "data" / "processed"
    / "8_m5_train_food_cleaned.csv"
)

MODEL_PATH = ROOT / "models"

OUTPUT_PATH = ROOT / "data" / "processed"

OUTPUT_PATH.mkdir(parents=True, exist_ok=True)

# =====================================================
# 2. LOAD HISTORICAL FOOD SALES
# =====================================================

print("\n========== LOADING HISTORICAL SALES ==========")

df = pd.read_csv(
    DATA_PATH,
    parse_dates=["date"]
)

df = df.sort_values(
    ["store_nbr", "family", "date"]
).reset_index(drop=True)

if df.duplicated(
    subset=["date", "store_nbr", "family"]
).any():
    raise ValueError("Duplicate historical records found.")

if df[["date", "store_nbr", "family", "sales"]].isnull().any().any():
    raise ValueError("Missing required historical values found.")

forecast_origin = df["date"].max()

print("Historical records:", len(df))
print("Forecast origin:", forecast_origin.date())
print("Stores:", df["store_nbr"].nunique())
print("Food families:", df["family"].nunique())

# =====================================================
# 3. CREATE COMPLETE HISTORICAL CALENDAR
# =====================================================

print("\n========== PREPARING HISTORICAL CALENDAR ==========")

all_dates = pd.date_range(
    start=df["date"].min(),
    end=forecast_origin,
    freq="D"
)

historical_series = {}

for (store, family), group in df.groupby(
    ["store_nbr", "family"],
    sort=True
):

    sales = (
        group.set_index("date")["sales"]
        .reindex(all_dates)
        .fillna(0)
    )

    historical_series[(store, family)] = sales

print("Calendar dates:", len(all_dates))
print("Store-family series:", len(historical_series))

# =====================================================
# 4. GENERATE FUTURE PREDICTIONS
# =====================================================

print("\n========== GENERATING FUTURE FORECASTS ==========")

all_forecasts = []

for horizon in [1, 2, 3]:

    print("\n" + "=" * 55)
    print(f"FORECASTING DAY +{horizon}")
    print("=" * 55)

    # Load the corresponding final model
    model_file = (
        MODEL_PATH
        / f"demand_forecast_final_day_{horizon}.pkl"
    )

    artifact = joblib.load(model_file)

    model = artifact["model"]
    features = artifact["features"]
    categories = artifact["family_categories"]

    if artifact["horizon"] != horizon:
        raise ValueError("Model horizon mismatch.")

    # Prepare model input
    records = []

    target_date = (
        forecast_origin
        + pd.Timedelta(days=horizon)
    )

    for (store, family), sales in historical_series.items():

        # Match training convention:
        # Features at forecast origin exclude sales
        # recorded on the forecast-origin date itself.

        previous_sales = sales.iloc[:-1].to_numpy()

        if len(previous_sales) < 14:
            raise ValueError(
                f"Insufficient history: store {store}, {family}"
            )

        record = {
            "store_nbr": store,
            "family": family,

            "lag_1": previous_sales[-1],
            "lag_2": previous_sales[-2],
            "lag_3": previous_sales[-3],
            "lag_7": previous_sales[-7],
            "lag_14": previous_sales[-14],

            "rolling_mean_7": previous_sales[-7:].mean(),
            "rolling_mean_14": previous_sales[-14:].mean(),

            "target_dayofweek": target_date.dayofweek,
            "target_month": target_date.month,
            "target_day": target_date.day,

            "target_is_weekend": int(
                target_date.dayofweek in [5, 6]
            )
        }

        records.append(record)

    X = pd.DataFrame(records)

    # Validate category compatibility
    dataset_categories = set(X["family"].unique())

    if dataset_categories != set(categories):
        raise ValueError(
            "Food family categories do not match model categories."
        )

    # Apply the exact categorical mapping used during training
    X["family"] = pd.Categorical(
        X["family"],
        categories=categories
    )

    # Use each model's own saved feature list
    X = X[features]

    # Generate predictions using all trained trees
    raw_predictions = model.predict(X)

    # Demand cannot be negative
    predictions = np.maximum(raw_predictions, 0)

    # Build output records
    forecast = pd.DataFrame({
        "forecast_origin_date": forecast_origin,
        "target_date": target_date,
        "store_nbr": [r["store_nbr"] for r in records],
        "family": [r["family"] for r in records],
        "horizon": horizon,
        "predicted_demand": predictions
    })

    print("Forecast target date:", target_date.date())
    print("Forecast records:", len(forecast))
    print("Negative predictions:", (raw_predictions < 0).sum())
    print(
        "Minimum predicted demand:",
        round(predictions.min(), 4)
    )

    all_forecasts.append(forecast)

# =====================================================
# 5. COMBINE THREE-DAY FORECASTS
# =====================================================

print("\n========== COMBINING FORECASTS ==========")

final_forecast = pd.concat(
    all_forecasts,
    ignore_index=True
)

final_forecast["predicted_demand"] = (
    final_forecast["predicted_demand"].round(4)
)

# =====================================================
# 6. DATA INTEGRITY CHECKS
# =====================================================

print("\n========== FORECAST INTEGRITY CHECK ==========")

expected_series = (
    df["store_nbr"].nunique()
    * df["family"].nunique()
)

expected_records = expected_series * 3

print("Expected store-family combinations:", expected_series)
print("Expected total forecast records:", expected_records)
print("Actual forecast records:", len(final_forecast))

if len(final_forecast) != expected_records:
    raise ValueError("Unexpected forecast record count.")

if final_forecast.duplicated(
    subset=["target_date", "store_nbr", "family"]
).any():
    raise ValueError("Duplicate forecast records found.")

if final_forecast["predicted_demand"].isna().any():
    raise ValueError("Missing predictions found.")

if (final_forecast["predicted_demand"] < 0).any():
    raise ValueError("Negative predictions found.")

print("All integrity checks passed.")

# =====================================================
# 7. EXPORT CSV
# =====================================================

csv_file = OUTPUT_PATH / "three_day_forecast.csv"

final_forecast.to_csv(
    csv_file,
    index=False
)

print("\nCSV saved:", csv_file)

# =====================================================
# 8. EXPORT JSON
# =====================================================

json_file = OUTPUT_PATH / "three_day_forecast.json"

final_forecast.to_json(
    json_file,
    orient="records",
    indent=2,
    date_format="iso"
)

print("JSON saved:", json_file)

# =====================================================
# 9. DISPLAY SAMPLE RESULTS
# =====================================================

print("\n========== SAMPLE FORECASTS ==========")

print(
    final_forecast.head(15).to_string(index=False)
)

print("\n========== FINAL FORECAST SUMMARY ==========")

print(
    final_forecast.groupby(
        ["target_date", "horizon"]
    )["predicted_demand"]
    .agg(["count", "sum", "mean"])
    .to_string()
)

print("\n========== FUTURE FORECASTING COMPLETED ==========")
