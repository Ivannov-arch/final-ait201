
import pandas as pd
import joblib

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = (
    ROOT / "data" / "processed"
    / "8_m5_train_food_cleaned.csv"
)

MODEL_PATH = ROOT / "models"

# Load actual forecasting dataset
df = pd.read_csv(DATA_PATH, parse_dates=["date"])

print("\n========== DATASET VERIFICATION ==========")

print("Dataset shape:", df.shape)
print("Date range:", df["date"].min(), "to", df["date"].max())

actual_families = sorted(df["family"].unique())

print("\nActual dataset families:")
for family in actual_families:
    print(repr(family))

print("\nNumber of families:", len(actual_families))
print("Number of stores:", df["store_nbr"].nunique())

# Inspect all final models
for horizon in [1, 2, 3]:

    print("\n" + "=" * 55)
    print(f"MODEL VERIFICATION: DAY +{horizon}")
    print("=" * 55)

    path = (
        MODEL_PATH
        / f"demand_forecast_final_day_{horizon}.pkl"
    )

    artifact = joblib.load(path)

    model = artifact["model"]

    saved_families = artifact["family_categories"]

    print("Saved horizon:", artifact["horizon"])
    print("Saved features:", artifact["features"])

    print("\nTree information:")
    print("Best iteration metadata:", artifact["best_iteration"])
    print("Model best_iteration_:", model.best_iteration_)
    print("Model n_estimators:", model.n_estimators)

    print(
        "Actual booster iterations:",
        model.booster_.current_iteration()
    )

    print("\nFamily category comparison:")

    print("Dataset families:", len(actual_families))
    print("Model families:", len(saved_families))

    print("Dataset-only categories:",
          sorted(set(actual_families) - set(saved_families)))

    print("Model-only categories:",
          sorted(set(saved_families) - set(actual_families)))

    print("\nBooster feature names:")
    print(model.booster_.feature_name())

print("\n========== VERIFICATION COMPLETED ==========")
