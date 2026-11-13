
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
        if denominator > 0
        else np.nan
    )

    return {
        "MAE": mae,
        "RMSE": rmse,
        "WAPE": wape
    }


# ==========================================
# 3. EVALUATE THREE MODELS
# ==========================================

overall_results = []
family_results = []

for horizon in [1, 2, 3]:

    print("\n" + "=" * 60)
    print(f"MODEL EVALUATION: DAY +{horizon}")
    print("=" * 60)

    # Load validation data
    validation = pd.read_pickle(
        DATA_PATH / f"validation_day_{horizon}.pkl"
    )

    # Load trained model
    artifact = joblib.load(
        MODEL_PATH / f"demand_forecast_day_{horizon}.pkl"
    )

    model = artifact["model"]
    features = artifact["features"]
    categories = artifact["family_categories"]

    # Prepare input features
    X_valid = validation[features].copy()

    X_valid["family"] = pd.Categorical(
        X_valid["family"],
        categories=categories
    )

    actual = validation["target"].to_numpy()

    # Predict
    raw_predictions = model.predict(
        X_valid,
        num_iteration=model.best_iteration_
    )

    # Demand cannot be negative.
    predictions = np.maximum(raw_predictions, 0)

    # ==========================================
    # 4. OVERALL EVALUATION
    # ==========================================

    metrics = calculate_metrics(
        actual,
        predictions
    )

    print("\nOVERALL LIGHTGBM PERFORMANCE")

    for name, value in metrics.items():
        print(f"{name}: {value:.4f}")

    print(
        "Negative raw predictions:",
        (raw_predictions < 0).sum()
    )

    overall_results.append({
        "Horizon": horizon,
        **metrics
    })

    # ==========================================
    # 5. BASELINE COMPARISON
    # ==========================================

    baseline = pd.read_csv(
        DATA_PATH / f"baseline_predictions_day_{horizon}.csv"
    )

    baseline_metrics = calculate_metrics(
        baseline["target"].to_numpy(),
        baseline["baseline_prediction"].to_numpy()
    )

    print("\nBASELINE PERFORMANCE")

    for name, value in baseline_metrics.items():
        print(f"{name}: {value:.4f}")

    print("\nIMPROVEMENT OVER BASELINE")

    for metric in ["MAE", "RMSE", "WAPE"]:

        improvement = (
            (baseline_metrics[metric] - metrics[metric])
            / baseline_metrics[metric]
            * 100
        )

        print(f"{metric} improvement: {improvement:.2f}%")

    # ==========================================
    # 6. CATEGORY-LEVEL EVALUATION
    # ==========================================

    evaluation = validation[
        ["target_date", "store_nbr", "family", "target"]
    ].copy()

    evaluation["prediction"] = predictions

    print("\nCATEGORY-LEVEL PERFORMANCE")

    for family, group in evaluation.groupby("family"):

        family_metrics = calculate_metrics(
            group["target"].to_numpy(),
            group["prediction"].to_numpy()
        )

        family_results.append({
            "Horizon": horizon,
            "Family": family,
            **family_metrics
        })

    family_summary = pd.DataFrame([
        row for row in family_results
        if row["Horizon"] == horizon
    ])

    print(
        family_summary.sort_values(
            "WAPE",
            ascending=True
        ).to_string(index=False)
    )

    # ==========================================
    # 7. SAVE PREDICTIONS
    # ==========================================

    evaluation["horizon"] = horizon

    evaluation.to_csv(
        DATA_PATH / f"lightgbm_predictions_day_{horizon}.csv",
        index=False
    )

    print("\nPredictions saved successfully.")


# ==========================================
# 8. FINAL MODEL COMPARISON
# ==========================================

print("\n" + "=" * 60)
print("FINAL THREE-DAY LIGHTGBM EVALUATION")
print("=" * 60)

overall_df = pd.DataFrame(overall_results)

print(overall_df.to_string(index=False))

overall_df.to_csv(
    DATA_PATH / "lightgbm_evaluation_summary.csv",
    index=False
)

family_df = pd.DataFrame(family_results)

family_df.to_csv(
    DATA_PATH / "lightgbm_family_evaluation.csv",
    index=False
)

print("\n========== EVALUATION COMPLETED ==========")
