
import pandas as pd
import numpy as np
import lightgbm as lgb

from pathlib import Path
from lightgbm import LGBMRegressor, early_stopping
from sklearn.metrics import mean_absolute_error, mean_squared_error

# ==========================================
# 1. PROJECT PATHS
# ==========================================

ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = ROOT / "data" / "processed"

# ==========================================
# 2. FEATURE CONFIGURATIONS
# ==========================================

FULL_FEATURES = [
    "store_nbr",
    "family",
    "lag_1",
    "lag_2",
    "lag_3",
    "lag_7",
    "lag_14",
    "rolling_mean_7",
    "rolling_mean_14",
    "target_dayofweek",
    "target_month",
    "target_day",
    "target_is_weekend"
]

EXPERIMENTS = {
    "A_full_model": FULL_FEATURES,

    "B_without_rolling14": [
        f for f in FULL_FEATURES
        if f != "rolling_mean_14"
    ],

    "C_simplified_model": [
        f for f in FULL_FEATURES
        if f not in [
            "rolling_mean_14",
            "target_is_weekend"
        ]
    ]
}

# ==========================================
# 3. MODEL PARAMETERS
# ==========================================

PARAMETERS = {
    "objective": "regression",
    "n_estimators": 2000,
    "learning_rate": 0.05,
    "num_leaves": 31,
    "max_depth": -1,
    "subsample": 0.8,
    "subsample_freq": 1,
    "colsample_bytree": 0.8,
    "reg_lambda": 1.0,
    "random_state": 42,
    "n_jobs": -1,
    "verbosity": -1
}

# ==========================================
# 4. STORE RESULTS
# ==========================================

all_results = []

# ==========================================
# 5. RUN EXPERIMENTS
# ==========================================

for horizon in [1, 2, 3]:

    print("\n" + "=" * 60)
    print(f"FORECAST HORIZON: DAY +{horizon}")
    print("=" * 60)

    train_data = pd.read_pickle(
        DATA_PATH / f"train_day_{horizon}.pkl"
    )

    validation_data = pd.read_pickle(
        DATA_PATH / f"validation_day_{horizon}.pkl"
    )

    y_train = train_data["target"]
    y_valid = validation_data["target"]

    for experiment_name, features in EXPERIMENTS.items():

        print("\nExperiment:", experiment_name)

        X_train = train_data[features].copy()
        X_valid = validation_data[features].copy()

        # Maintain consistent categorical levels
        if "family" in features:

            categories = sorted(
                set(X_train["family"].unique())
                | set(X_valid["family"].unique())
            )

            X_train["family"] = pd.Categorical(
                X_train["family"],
                categories=categories
            )

            X_valid["family"] = pd.Categorical(
                X_valid["family"],
                categories=categories
            )

        model = LGBMRegressor(**PARAMETERS)

        model.fit(
            X_train,
            y_train,
            eval_set=[(X_valid, y_valid)],
            eval_metric="l1",
            categorical_feature=["family"],
            callbacks=[
                early_stopping(stopping_rounds=100)
            ]
        )

        # ==========================================
        # EVALUATE
        # ==========================================

        raw_predictions = model.predict(
            X_valid,
            num_iteration=model.best_iteration_
        )

        predictions = np.maximum(
            raw_predictions,
            0
        )

        mae = mean_absolute_error(
            y_valid,
            predictions
        )

        rmse = np.sqrt(
            mean_squared_error(
                y_valid,
                predictions
            )
        )

        wape = (
            np.abs(y_valid.to_numpy() - predictions).sum()
            / np.abs(y_valid.to_numpy()).sum()
            * 100
        )

        print("MAE:", round(mae, 4))
        print("RMSE:", round(rmse, 4))
        print("WAPE:", round(wape, 4))
        print("Best iteration:", model.best_iteration_)

        all_results.append({
            "Horizon": horizon,
            "Experiment": experiment_name,
            "Features": len(features),
            "MAE": mae,
            "RMSE": rmse,
            "WAPE": wape,
            "Best_iteration": model.best_iteration_
        })

# ==========================================
# 6. FINAL COMPARISON
# ==========================================

results = pd.DataFrame(all_results)

print("\n" + "=" * 60)
print("FEATURE ABLATION COMPARISON")
print("=" * 60)

print(
    results.sort_values(
        ["Horizon", "MAE"]
    ).to_string(index=False)
)

results.to_csv(
    DATA_PATH / "feature_ablation_results.csv",
    index=False
)

print("\nResults saved successfully.")
print("========== ABLATION COMPLETED ==========")
