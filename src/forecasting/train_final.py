
import pandas as pd
import lightgbm as lgb
import joblib
import json

from pathlib import Path
from lightgbm import LGBMRegressor

# ==========================================
# 1. PROJECT PATHS
# ==========================================

ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = ROOT / "data" / "processed"
MODEL_PATH = ROOT / "models"

MODEL_PATH.mkdir(parents=True, exist_ok=True)

TARGET = "target"

# ==========================================
# 2. TRAIN FINAL MODELS
# ==========================================

for horizon in [1, 2, 3]:

    print("\n" + "=" * 60)
    print(f"FINAL MODEL TRAINING: DAY +{horizon}")
    print("=" * 60)

    # ==========================================
    # 3. LOAD FINAL DATASETS
    # ==========================================

    train = pd.read_pickle(
        DATA_PATH / f"train_final_day_{horizon}.pkl"
    )

    validation = pd.read_pickle(
        DATA_PATH / f"validation_final_day_{horizon}.pkl"
    )

    print("Training rows:", len(train))
    print("Validation rows:", len(validation))

    # ==========================================
    # 4. LOAD BEST CONFIGURATION
    # ==========================================

    config_file = (
        MODEL_PATH / f"best_config_day_{horizon}.json"
    )

    with open(config_file, "r") as file:
        config = json.load(file)

    features = config["features"]
    categories = config["family_categories"]
    best_params = config["parameters"]
    best_iteration = config["best_iteration"]

    print("\nSelected features:", len(features))
    print("Best iteration:", best_iteration)
    print("Best validation MAE:", config["MAE"])

    # ==========================================
    # 5. COMBINE TRAINING + VALIDATION
    # ==========================================

    final_train = pd.concat(
        [train, validation],
        ignore_index=True
    )

    print("\nCombined training rows:", len(final_train))

    # ==========================================
    # 6. PREPARE FEATURES AND TARGET
    # ==========================================

    X_train = final_train[features].copy()

    y_train = final_train[TARGET]

    # Consistent categorical encoding
    X_train["family"] = pd.Categorical(
        X_train["family"],
        categories=categories
    )

    # ==========================================
    # 7. INITIALIZE FINAL MODEL
    # ==========================================

    parameters = {
        "objective": "regression",
        "n_estimators": best_iteration,
        "subsample": 0.8,
        "subsample_freq": 1,
        "random_state": 42,
        "n_jobs": -1,
        "verbosity": -1
    }

    parameters.update(best_params)

    model = LGBMRegressor(**parameters)

    # ==========================================
    # 8. TRAIN FINAL MODEL
    # ==========================================

    print("\nStarting final training...")

    model.fit(
        X_train,
        y_train,
        categorical_feature=["family"]
    )

    print("\nFinal model training completed.")

    # ==========================================
    # 9. SAVE FINAL MODEL
    # ==========================================

    model_file = (
        MODEL_PATH /
        f"demand_forecast_final_day_{horizon}.pkl"
    )

    model_artifact = {
        "model": model,
        "features": features,
        "family_categories": categories,
        "horizon": horizon,
        "best_iteration": best_iteration,
        "best_parameters": best_params,
        "training_rows": len(final_train)
    }

    joblib.dump(
        model_artifact,
        model_file
    )

    print("\nFinal model saved:", model_file)
    print("Features:", len(features))
    print("Training records:", len(final_train))
    print("Iterations:", best_iteration)

# ==========================================
# 10. COMPLETION
# ==========================================

print("\n" + "=" * 60)
print("ALL THREE FINAL MODELS TRAINED SUCCESSFULLY")
print("=" * 60)
