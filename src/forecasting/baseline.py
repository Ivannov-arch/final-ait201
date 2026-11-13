
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.metrics import mean_absolute_error, mean_squared_error

# ==========================================
# 1. PROJECT PATHS
# ==========================================

ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = ROOT / "data" / "processed"

FOOD_DATA_PATH = (
    DATA_PATH / "8_m5_train_food_cleaned.csv"
)

# ==========================================
# 2. LOAD ORIGINAL FOOD SALES
# ==========================================

print("\n========== LOADING HISTORICAL SALES ==========")

sales_data = pd.read_csv(
    FOOD_DATA_PATH,
    parse_dates=["date"]
)

print("Historical records:", len(sales_data))

# ==========================================
# 3. PREPARE HISTORICAL LOOKUP
# ==========================================

sales_lookup = sales_data.rename(
    columns={
        "date": "baseline_date",
        "sales": "baseline_prediction"
    }
)

sales_lookup = sales_lookup[
    [
        "baseline_date",
        "store_nbr",
        "family",
        "baseline_prediction"
    ]
]

# ==========================================
# 4. EVALUATE ALL THREE HORIZONS
# ==========================================

results = []

for horizon in [1, 2, 3]:

    print("\n" + "=" * 55)
    print(f"BASELINE: DAY +{horizon}")
    print("=" * 55)

    # Load validation data
    validation = pd.read_pickle(
        DATA_PATH / f"validation_day_{horizon}.pkl"
    )

    # The baseline uses the same weekday
    # from the previous week.
    validation["baseline_date"] = (
        validation["target_date"]
        - pd.Timedelta(days=7)
    )

    # Retrieve historical sales
    predictions = validation.merge(
        sales_lookup,
        on=["baseline_date", "store_nbr", "family"],
        how="left",
        validate="many_to_one"
    )

    # ==========================================
    # 5. CHECK BASELINE DATA
    # ==========================================

    missing = predictions["baseline_prediction"].isna().sum()

    print("Validation rows:", len(predictions))
    print("Missing baseline predictions:", missing)

    if missing > 0:
        raise ValueError(
            f"Missing {missing} baseline predictions "
            f"for Day +{horizon}."
        )

    # ==========================================
    # 6. CALCULATE EVALUATION METRICS
    # ==========================================

    actual = predictions["target"]
    predicted = predictions["baseline_prediction"]

    mae = mean_absolute_error(actual, predicted)

    rmse = np.sqrt(
        mean_squared_error(actual, predicted)
    )

    # Weighted Absolute Percentage Error
    denominator = actual.abs().sum()

    wape = (
        (actual - predicted).abs().sum()
        / denominator
        * 100
        if denominator > 0
        else np.nan
    )

    # ==========================================
    # 7. DISPLAY RESULTS
    # ==========================================

    print("\n========== BASELINE METRICS ==========")

    print(f"MAE:  {mae:.4f}")
    print(f"RMSE: {rmse:.4f}")
    print(f"WAPE: {wape:.2f}%")

    # ==========================================
    # 8. SAVE PREDICTIONS
    # ==========================================

    predictions["prediction_error"] = (
        actual - predicted
    )

    output_file = (
        DATA_PATH
        / f"baseline_predictions_day_{horizon}.csv"
    )

    predictions.to_csv(output_file, index=False)

    print("\nSample predictions:")

    print(
        predictions[
            [
                "target_date",
                "store_nbr",
                "family",
                "target",
                "baseline_prediction",
                "prediction_error"
            ]
        ].head(10).to_string(index=False)
    )

    print("\nSaved:", output_file)

    results.append({
        "horizon": horizon,
        "MAE": mae,
        "RMSE": rmse,
        "WAPE": wape
    })

# ==========================================
# 9. FINAL COMPARISON
# ==========================================

print("\n========== THREE-DAY BASELINE SUMMARY ==========")

summary = pd.DataFrame(results)

print(summary.to_string(index=False))

summary.to_csv(
    DATA_PATH / "baseline_summary.csv",
    index=False
)

print("\nBaseline forecasting completed successfully.")
