
import pandas as pd
import numpy as np
import joblib

from pathlib import Path
from sklearn.metrics import mean_absolute_error

# ==========================================
# 1. PROJECT PATHS
# ==========================================

ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = ROOT / "data" / "processed"
MODEL_PATH = ROOT / "models"

REPEATS = 3

# ==========================================
# 2. PROCESS THREE HORIZONS
# ==========================================

for horizon in [1, 2, 3]:

    print("\n" + "=" * 60)
    print(f"GROUPED PERMUTATION: DAY +{horizon}")
    print("=" * 60)

    validation = pd.read_pickle(
        DATA_PATH / f"validation_day_{horizon}.pkl"
    ).reset_index(drop=True)

    artifact = joblib.load(
        MODEL_PATH / f"demand_forecast_day_{horizon}.pkl"
    )

    model = artifact["model"]
    features = artifact["features"]
    categories = artifact["family_categories"]

    X = validation[features].copy()

    X["family"] = pd.Categorical(
        X["family"],
        categories=categories
    )

    y = validation["target"].to_numpy()

    # Group positions by store and food family
    groups = validation.groupby(
        ["store_nbr", "family"],
        observed=True
    ).indices

    # Original predictions and MAE
    original_predictions = np.maximum(
        model.predict(
            X,
            num_iteration=model.best_iteration_
        ),
        0
    )

    original_mae = mean_absolute_error(
        y,
        original_predictions
    )

    print(f"Original MAE: {original_mae:.4f}")

    results = []

    # Only numerical features can be shuffled
    # within store-family groups.
    numeric_features = [
        feature for feature in features
        if feature not in ["store_nbr", "family"]
    ]

    # ==========================================
    # 3. GROUPED PERMUTATION
    # ==========================================

    for feature in numeric_features:

        increases = []

        for repeat in range(REPEATS):

            X_permuted = X.copy()

            rng = np.random.default_rng(
                42 + repeat
            )

            for positions in groups.values():

                if len(positions) > 1:

                    values = X_permuted.loc[
                        positions, feature
                    ].to_numpy(copy=True)

                    X_permuted.loc[
                        positions, feature
                    ] = rng.permutation(values)

            predictions = np.maximum(
                model.predict(
                    X_permuted,
                    num_iteration=model.best_iteration_
                ),
                0
            )

            shuffled_mae = mean_absolute_error(
                y,
                predictions
            )

            increases.append(
                shuffled_mae - original_mae
            )

        results.append({
            "Feature": feature,
            "MAE_Increase": np.mean(increases),
            "Standard_Deviation": np.std(increases)
        })

    # ==========================================
    # 4. DISPLAY RESULTS
    # ==========================================

    importance = pd.DataFrame(results)

    importance = importance.sort_values(
        "MAE_Increase",
        ascending=False
    )

    print("\nGROUPED PERMUTATION RESULTS")

    print(importance.to_string(index=False))

    # ==========================================
    # 5. SAVE RESULTS
    # ==========================================

    importance.to_csv(
        DATA_PATH /
        f"grouped_permutation_day_{horizon}.csv",
        index=False
    )

    print("\nGrouped permutation completed.")

print("\n========== ALL GROUPED ANALYSES COMPLETED ==========")
