
import pandas as pd
import lightgbm as lgb
import joblib

from pathlib import Path
from lightgbm import LGBMRegressor, early_stopping, log_evaluation

# ==========================================
# 1. PROJECT PATHS
# ==========================================

ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = ROOT / "data" / "processed"

MODEL_PATH = ROOT / "models"

MODEL_PATH.mkdir(parents=True, exist_ok=True)

# ==========================================
# 2. DEFINE FEATURES
# ==========================================

FEATURES = [
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

TARGET = "target"

# ==========================================
# 3. LIGHTGBM PARAMETERS
# ==========================================

PARAMETERS = {
    "objective": "regression",
    "metric": ["mae", "rmse"],
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
# 4. TRAIN THREE MODELS
# ==========================================

for horizon in [1, 2, 3]:

    print("\n" + "=" * 60)
    print(f"TRAINING LIGHTGBM: DAY +{horizon}")
    print("=" * 60)

    # Load training and validation datasets
    train_data = pd.read_pickle(
        DATA_PATH / f"train_day_{horizon}.pkl"
    )

    validation_data = pd.read_pickle(
        DATA_PATH / f"validation_day_{horizon}.pkl"
    )

    print("Training shape:", train_data.shape)
    print("Validation shape:", validation_data.shape)

    # Separate features and target
    X_train = train_data[FEATURES].copy()
    y_train = train_data[TARGET]

    X_valid = validation_data[FEATURES].copy()
    y_valid = validation_data[TARGET]

    # Consistent categorical encoding
    family_categories = sorted(
        set(X_train["family"].unique())
        | set(X_valid["family"].unique())
    )

    X_train["family"] = pd.Categorical(
        X_train["family"],
        categories=family_categories
    )

    X_valid["family"] = pd.Categorical(
        X_valid["family"],
        categories=family_categories
    )

    # ==========================================
    # 5. INITIALIZE MODEL
    # ==========================================

    model = LGBMRegressor(**PARAMETERS)

    # ==========================================
    # 6. TRAIN MODEL
    # ==========================================

    print("\nStarting model training...")

    model.fit(
        X_train,
        y_train,
        eval_set=[(X_valid, y_valid)],
        eval_metric=["l1", "rmse"],
        categorical_feature=["family"],
        callbacks=[
            early_stopping(stopping_rounds=100),
            log_evaluation(period=100)
        ]
    )

    # ==========================================
    # 7. SAVE MODEL
    # ==========================================

    model_file = MODEL_PATH / f"demand_forecast_day_{horizon}.pkl"

    model_artifact = {
        "model": model,
        "features": FEATURES,
        "family_categories": family_categories,
        "horizon": horizon
    }

    joblib.dump(model_artifact, model_file)

    print("\nModel saved:", model_file)

    print(
        "Best iteration:",
        model.best_iteration_
    )

    print(
        "Best validation score:",
        model.best_score_
    )

print("\n========== ALL LIGHTGBM MODELS TRAINED ==========")
