
import pandas as pd
from pathlib import Path

# ==========================================
# 1. PROJECT PATHS
# ==========================================

ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = ROOT / "data" / "processed"

# ==========================================
# 2. SPLIT CONFIGURATION
# ==========================================

VALIDATION_DAYS = 30
TEST_DAYS = 30

# ==========================================
# 3. PROCESS EACH FORECAST HORIZON
# ==========================================

for horizon in [1, 2, 3]:

    print("\n" + "=" * 60)
    print(f"FINAL CHRONOLOGICAL SPLIT: DAY +{horizon}")
    print("=" * 60)

    # Load feature-engineered dataset
    data = pd.read_pickle(
        DATA_PATH / f"forecast_day_{horizon}.pkl"
    )

    data["target_date"] = pd.to_datetime(
        data["target_date"]
    )

    print("Original shape:", data.shape)

    # ==========================================
    # 4. DETERMINE DATE BOUNDARIES
    # ==========================================

    unique_dates = sorted(
        data["target_date"].dropna().unique()
    )

    if len(unique_dates) <= VALIDATION_DAYS + TEST_DAYS:
        raise ValueError("Insufficient dates for splitting.")

    test_start = unique_dates[-TEST_DAYS]

    validation_start = unique_dates[
        -(TEST_DAYS + VALIDATION_DAYS)
    ]

    # ==========================================
    # 5. CREATE THREE DATASETS
    # ==========================================

    train = data[
        data["target_date"] < validation_start
    ].copy()

    validation = data[
        (data["target_date"] >= validation_start)
        & (data["target_date"] < test_start)
    ].copy()

    test = data[
        data["target_date"] >= test_start
    ].copy()

    # ==========================================
    # 6. VERIFY DATE RANGES
    # ==========================================

    print("\nTRAINING DATA")
    print("Rows:", len(train))
    print(
        "Date range:",
        train["target_date"].min(),
        "to",
        train["target_date"].max()
    )

    print("\nVALIDATION DATA")
    print("Rows:", len(validation))
    print(
        "Date range:",
        validation["target_date"].min(),
        "to",
        validation["target_date"].max()
    )

    print("\nTEST DATA")
    print("Rows:", len(test))
    print(
        "Date range:",
        test["target_date"].min(),
        "to",
        test["target_date"].max()
    )

    # ==========================================
    # 7. DATA LEAKAGE CHECKS
    # ==========================================

    assert (
        train["target_date"].max()
        < validation["target_date"].min()
    )

    assert (
        validation["target_date"].max()
        < test["target_date"].min()
    )

    assert (
        len(train) + len(validation) + len(test)
        == len(data)
    )

    assert not train.empty
    assert not validation.empty
    assert not test.empty

    print("\n========== LEAKAGE CHECK ==========")
    print("Training before validation: True")
    print("Validation before test: True")
    print("All rows preserved: True")

    # ==========================================
    # 8. SAVE DATASETS
    # ==========================================

    train.to_pickle(
        DATA_PATH / f"train_final_day_{horizon}.pkl"
    )

    validation.to_pickle(
        DATA_PATH / f"validation_final_day_{horizon}.pkl"
    )

    test.to_pickle(
        DATA_PATH / f"test_final_day_{horizon}.pkl"
    )

    print("\nFinal datasets saved successfully.")

print("\n========== FINAL SPLITTING COMPLETED ==========")
