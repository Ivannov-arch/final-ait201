
import pandas as pd
import numpy as np
import joblib

from pathlib import Path
from sklearn.inspection import permutation_importance
from sklearn.metrics import mean_absolute_error

# ==========================================
# 1. PROJECT PATHS
# ==========================================

ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = ROOT / "data" / "processed"
MODEL_PATH = ROOT / "models"

# ==========================================
# 2. ANALYSE EACH HORIZON
# ==========================================

for horizon in [1, 2, 3]:

    print("\n" + "=" * 60)
    print(f"PERMUTATION IMPORTANCE: DAY +{horizon}")
    print("=" * 60)

    # Load validation data
    validation = pd.read_pickle(
        DATA_PATH / f"validation_day_{horizon}.pkl"
    )

    # Load model artifact
    artifact = joblib.load(
        MODEL_PATH / f"demand_forecast_day_{horizon}.pkl"
    )

    model = artifact["model"]
    features = artifact["features"]
    categories = artifact["family_categories"]

    # Prepare validation features
    X_valid = validation[features].copy()

    X_valid["family"] = pd.Categorical(
        X_valid["family"],
        categories=categories
    )

    y_valid = validation["target"].to_numpy()

    # ==========================================
    # 3. BASELINE MODEL PERFORMANCE
    # ==========================================

    base_predictions = np.maximum(
        model.predict(
            X_valid,
            num_iteration=model.best_iteration_
        ),
        0
    )

    baseline_mae = mean_absolute_error(
        y_valid,
        base_predictions
    )

    print(f"Original MAE: {baseline_mae:.4f}")

    # ==========================================
    # 4. PERMUTATION IMPORTANCE
    # ==========================================

    print("\nCalculating permutation importance...")

    result = permutation_importance(
        estimator=model,
        X=X_valid,
        y=y_valid,
        scoring="neg_mean_absolute_error",
        n_repeats=3,
        random_state=42,
        n_jobs=1
    )

    # ==========================================
    # 5. ORGANISE RESULTS
    # ==========================================

    importance = pd.DataFrame({
        "Feature": features,
        "Importance_MAE_Increase": result.importances_mean,
        "Standard_Deviation": result.importances_std
    })

    importance = importance.sort_values(
        "Importance_MAE_Increase",
        ascending=False
    )

    print("\n========== PERMUTATION RESULTS ==========")

    print(importance.to_string(index=False))

    # ==========================================
    # 6. SAVE RESULTS
    # ==========================================

    output_file = (
        DATA_PATH
        / f"permutation_importance_day_{horizon}.csv"
    )

    importance.to_csv(output_file, index=False)

    print("\nSaved:", output_file)

print("\n========== PERMUTATION ANALYSIS COMPLETED ==========")
