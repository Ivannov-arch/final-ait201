
import pandas as pd
import numpy as np
import joblib

from pathlib import Path
from sklearn.metrics import mean_absolute_error, mean_squared_error

# ==========================================
# 1. PROJECT PATHS
# ==========================================

ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = ROOT / "data" / "processed"
MODEL_PATH = ROOT / "models"

TARGET = "target"

all_results = []
all_category_results = []

# ==========================================
# 2. METRIC FUNCTION
# ==========================================

def calculate_metrics(actual, predicted):

    mae = mean_absolute_error(actual, predicted)

    rmse = np.sqrt(
        mean_squared_error(actual, predicted)
    )

    denominator = np.abs(actual).sum()

    wape = (
        np.abs(actual - predicted).sum()
        / denominator * 100
        if denominator != 0 else np.nan
    )

    return mae, rmse, wape


# ==========================================
# 3. EVALUATE THREE FINAL MODELS
# ==========================================

for horizon in [1, 2, 3]:

    print("\n" + "=" * 65)
    print(f"FINAL TEST EVALUATION: DAY +{horizon}")
    print("=" * 65)

    # ==========================================
    # 4. LOAD FINAL MODEL
    # ==========================================

    model_file = (
        MODEL_PATH /
        f"demand_forecast_final_day_{horizon}.pkl"
    )

    artifact = joblib.load(model_file)

    model = artifact["model"]
    features = artifact["features"]
    categories = artifact["family_categories"]

    # ==========================================
    # 5. LOAD UNTOUCHED TEST DATA
    # ==========================================

    test = pd.read_pickle(
        DATA_PATH / f"test_final_day_{horizon}.pkl"
    )

    X_test = test[features].copy()
    y_test = test[TARGET].to_numpy()

    X_test["family"] = pd.Categorical(
        X_test["family"],
        categories=categories
    )

    print("Test rows:", len(test))
    print("Features:", len(features))

    # ==========================================
    # 6. GENERATE PREDICTIONS
    # ==========================================

    raw_predictions = model.predict(X_test)

    negative_predictions = (
        raw_predictions < 0
    ).sum()

    predictions = np.maximum(
        raw_predictions,
        0
    )

    # ==========================================
    # 7. LIGHTGBM METRICS
    # ==========================================

    mae, rmse, wape = calculate_metrics(
        y_test,
        predictions
    )

    print("\nLIGHTGBM TEST PERFORMANCE")
    print("MAE:", round(mae, 4))
    print("RMSE:", round(rmse, 4))
    print("WAPE:", round(wape, 4), "%")

    print(
        "Negative raw predictions:",
        negative_predictions
    )

    # ==========================================
    # 8. LOAD MATCHING BASELINE
    # ==========================================

    baseline_file = (
        DATA_PATH /
        f"baseline_predictions_day_{horizon}.csv"
    )

    baseline = pd.read_csv(
        baseline_file,
        parse_dates=["target_date"]
    )

    keys = ["target_date", "store_nbr", "family"]

    # Verify the baseline covers the same test records
    test_keys = test[keys].copy()

    baseline_check = test_keys.merge(
        baseline[keys],
        on=keys,
        how="outer",
        indicator=True,
        validate="one_to_one"
    )

    if not (baseline_check["_merge"] == "both").all():
        raise ValueError(
            f"Baseline records do not match test data "
            f"for Day +{horizon}."
        )

    baseline = baseline[
        keys + ["baseline_prediction"]
    ]

    comparison = test[
        keys + [TARGET]
    ].copy()

    comparison = comparison.merge(
        baseline,
        on=keys,
        how="left",
        validate="one_to_one"
    )

    if not np.allclose(
        comparison[TARGET].to_numpy(),
        y_test
    ):
        raise ValueError("Baseline actual targets do not match test data.")

    baseline_predictions = comparison[
        "baseline_prediction"
    ].to_numpy()

    baseline_mae, baseline_rmse, baseline_wape = (
        calculate_metrics(
            y_test,
            baseline_predictions
        )
    )

    # ==========================================
    # 9. COMPARE AGAINST BASELINE
    # ==========================================

    print("\nBASELINE TEST PERFORMANCE")
    print("MAE:", round(baseline_mae, 4))
    print("RMSE:", round(baseline_rmse, 4))
    print("WAPE:", round(baseline_wape, 4), "%")

    mae_improvement = (
        (baseline_mae - mae) / baseline_mae * 100
    )

    rmse_improvement = (
        (baseline_rmse - rmse) / baseline_rmse * 100
    )

    wape_improvement = (
        (baseline_wape - wape) / baseline_wape * 100
    )

    print("\nIMPROVEMENT OVER BASELINE")
    print("MAE:", round(mae_improvement, 2), "%")
    print("RMSE:", round(rmse_improvement, 2), "%")
    print("WAPE:", round(wape_improvement, 2), "%")

    # ==========================================
    # 10. SAVE PREDICTIONS
    # ==========================================

    output = test[
        keys + [TARGET]
    ].copy()

    output["baseline_prediction"] = baseline_predictions
    output["raw_prediction"] = raw_predictions
    output["predicted_sales"] = predictions
    output["prediction_error"] = y_test - predictions

    output.to_csv(
        DATA_PATH /
        f"final_predictions_day_{horizon}.csv",
        index=False
    )

    # ==========================================
    # 11. CATEGORY-LEVEL PERFORMANCE
    # ==========================================

    category_data = output.copy()

    print("\nCATEGORY-LEVEL PERFORMANCE")

    for family, group in category_data.groupby("family"):

        actual = group[TARGET].to_numpy()
        predicted = group["predicted_sales"].to_numpy()

        family_mae, family_rmse, family_wape = (
            calculate_metrics(actual, predicted)
        )

        all_category_results.append({
            "Horizon": horizon,
            "Family": family,
            "MAE": family_mae,
            "RMSE": family_rmse,
            "WAPE": family_wape
        })

    category_df = pd.DataFrame([
        result for result in all_category_results
        if result["Horizon"] == horizon
    ])

    print(
        category_df.sort_values(
            "WAPE"
        ).to_string(index=False)
    )

    # ==========================================
    # 12. STORE OVERALL RESULTS
    # ==========================================

    all_results.append({
        "Horizon": horizon,
        "MAE": mae,
        "RMSE": rmse,
        "WAPE": wape,
        "Baseline_MAE": baseline_mae,
        "Baseline_RMSE": baseline_rmse,
        "Baseline_WAPE": baseline_wape,
        "MAE_Improvement_%": mae_improvement,
        "RMSE_Improvement_%": rmse_improvement,
        "WAPE_Improvement_%": wape_improvement,
        "Negative_Raw_Predictions": negative_predictions
    })

    print("\nPredictions saved successfully.")


# ==========================================
# 13. FINAL SUMMARY
# ==========================================

results_df = pd.DataFrame(all_results)

category_results_df = pd.DataFrame(
    all_category_results
)

results_df.to_csv(
    DATA_PATH / "final_test_summary.csv",
    index=False
)

category_results_df.to_csv(
    DATA_PATH / "final_category_test_results.csv",
    index=False
)

print("\n" + "=" * 65)
print("FINAL THREE-DAY TEST RESULTS")
print("=" * 65)

print(
    results_df.to_string(index=False)
)

print("\n========== FINAL TESTING COMPLETED ==========")
