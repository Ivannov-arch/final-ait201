
import pandas as pd
from pathlib import Path

# ==========================================
# 1. PROJECT PATHS
# ==========================================

ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = ROOT / "data" / "processed"

# ==========================================
# 2. DEFINE VALIDATION PERIOD
# ==========================================

VALIDATION_START = pd.Timestamp("2017-07-17")
VALIDATION_END = pd.Timestamp("2017-08-15")

# ==========================================
# 3. PROCESS EACH FORECAST HORIZON
# ==========================================

for horizon in [1, 2, 3]:

    print("\n" + "=" * 55)
    print(f"FORECAST HORIZON: DAY +{horizon}")
    print("=" * 55)

    # Load feature dataset
    file_path = DATA_PATH / f"forecast_day_{horizon}.pkl"

    data = pd.read_pickle(file_path)

    print("Original shape:", data.shape)

    # Ensure dates are datetime
    data["date"] = pd.to_datetime(data["date"])
    data["target_date"] = pd.to_datetime(data["target_date"])

    # ==========================================
    # 4. CHRONOLOGICAL SPLITTING
    # ==========================================

    train_data = data[
        data["target_date"] < VALIDATION_START
    ].copy()

    validation_data = data[
        (data["target_date"] >= VALIDATION_START)
        & (data["target_date"] <= VALIDATION_END)
    ].copy()

    # ==========================================
    # 5. DISPLAY RESULTS
    # ==========================================

    print("\nTraining rows:", len(train_data))
    print("Validation rows:", len(validation_data))

    print("\nTraining target date range:")

    print(
        train_data["target_date"].min(),
        "to",
        train_data["target_date"].max()
    )

    print("\nValidation target date range:")

    print(
        validation_data["target_date"].min(),
        "to",
        validation_data["target_date"].max()
    )

    # ==========================================
    # 6. CHECK DATA LEAKAGE
    # ==========================================

    print("\n========== LEAKAGE CHECK ==========")

    no_leakage = (
        train_data["target_date"].max()
        < validation_data["target_date"].min()
    )

    print("Training ends before validation:", no_leakage)

    # Verify forecast horizon
    correct_horizon = (
        (data["target_date"] - data["date"]).dt.days == horizon
    ).all()

    print("Forecast horizon verified:", correct_horizon)

    if not no_leakage or not correct_horizon:
        raise ValueError("Data splitting verification failed.")

    # ==========================================
    # 7. SAVE DATASETS
    # ==========================================

    train_data.to_pickle(
        DATA_PATH / f"train_day_{horizon}.pkl"
    )

    validation_data.to_pickle(
        DATA_PATH / f"validation_day_{horizon}.pkl"
    )

    print("\nDatasets saved successfully.")

print("\n========== ALL SPLITS COMPLETED ==========")
