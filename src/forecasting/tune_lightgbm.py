
import pandas as pd
import numpy as np
import lightgbm as lgb
import json

from pathlib import Path
from sklearn.model_selection import ParameterSampler
from sklearn.metrics import mean_absolute_error, mean_squared_error
from lightgbm import LGBMRegressor, early_stopping

# ==========================================
# 1. PROJECT PATHS
# ==========================================

ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = ROOT / "data" / "processed"
MODEL_PATH = ROOT / "models"

MODEL_PATH.mkdir(parents=True, exist_ok=True)

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

FEATURES_BY_HORIZON = {
    1: [
        f for f in FULL_FEATURES
        if f != "rolling_mean_14"
    ],
    2: FULL_FEATURES,
    3: FULL_FEATURES
}

# ==========================================
# 3. HYPERPARAMETER SEARCH SPACE
# ==========================================

PARAMETER_SPACE = {
    "learning_rate": [0.03, 0.05, 0.07],
    "num_leaves": [15, 31, 50, 63],
    "max_depth": [-1, 6, 8, 10],
    "min_child_samples": [20, 40, 60, 100],
    "colsample_bytree": [0.7, 0.8, 0.9, 1.0],
    "reg_lambda": [0.1, 1.0, 5.0, 10.0]
}

N_ITER = 8

# ==========================================
# 4. RESULTS
# ==========================================

all_results = []

# ==========================================
# 5. TUNE EACH HORIZON
# ==========================================

for horizon in [1, 2, 3]:

    print("\n" + "=" * 60)
    print(f"HYPERPARAMETER TUNING: DAY +{horizon}")
    print("=" * 60)

    train = pd.read_pickle(
        DATA_PATH / f"train_final_day_{horizon}.pkl"
    )

    validation = pd.read_pickle(
        DATA_PATH / f"validation_final_day_{horizon}.pkl"
    )

    features = FEATURES_BY_HORIZON[horizon]

    X_train = train[features].copy()
    X_valid = validation[features].copy()

    y_train = train["target"]
    y_valid = validation["target"]

    # Consistent categorical encoding
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

    # Generate random configurations
    configurations = list(
        ParameterSampler(
            PARAMETER_SPACE,
            n_iter=N_ITER,
            random_state=42
        )
    )

    horizon_results = []

    # ==========================================
    # 6. TRAIN EACH CONFIGURATION
    # ==========================================

    for index, params in enumerate(configurations, start=1):

        print("\nConfiguration:", index, "/", N_ITER)
        print("Parameters:", params)

        model = LGBMRegressor(
            objective="regression",
            n_estimators=3000,
            subsample=0.8,
            subsample_freq=1,
            random_state=42,
            n_jobs=-1,
            verbosity=-1,
            **params
        )

        model.fit(
            X_train,
            y_train,
            eval_set=[(X_valid, y_valid)],
            eval_metric="l1",
            categorical_feature=["family"],
            callbacks=[
                early_stopping(stopping_rounds=100),
                lgb.log_evaluation(period=0)
            ]
        )

        predictions = np.maximum(
            model.predict(
                X_valid,
                num_iteration=model.best_iteration_
            ),
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

        result = {
            "horizon": horizon,
            "configuration": index,
            "features": features,
            "family_categories": categories,
            "parameters": params,
            "MAE": float(mae),
            "RMSE": float(rmse),
            "WAPE": float(wape),
            "best_iteration": int(model.best_iteration_)
        }

        horizon_results.append(result)

        all_results.append({
            "Horizon": horizon,
            "Configuration": index,
            "MAE": mae,
            "RMSE": rmse,
            "WAPE": wape,
            "Best_iteration": model.best_iteration_,
            **params
        })

    # ==========================================
    # 7. SELECT BEST CONFIGURATION
    # ==========================================

    best_result = min(
        horizon_results,
        key=lambda x: x["MAE"]
    )

    print("\n========== BEST CONFIGURATION ==========")
    print("Best MAE:", best_result["MAE"])
    print("Best parameters:", best_result["parameters"])

    # Save tuning configuration
    output_file = (
        MODEL_PATH / f"best_config_day_{horizon}.json"
    )

    with open(output_file, "w") as file:
        json.dump(best_result, file, indent=4)

    print("Saved:", output_file)

# ==========================================
# 8. SAVE ALL RESULTS
# ==========================================

results_df = pd.DataFrame(all_results)

results_df.to_csv(
    DATA_PATH / "lightgbm_tuning_results.csv",
    index=False
)

print("\n========== TUNING COMPLETED ==========")
print(results_df.to_string(index=False))
