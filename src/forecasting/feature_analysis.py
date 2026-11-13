
import pandas as pd
import matplotlib.pyplot as plt
import joblib

from pathlib import Path

# ==========================================
# 1. PROJECT PATHS
# ==========================================

ROOT = Path(__file__).resolve().parents[2]

MODEL_PATH = ROOT / "models"
OUTPUT_PATH = ROOT / "data" / "processed"

OUTPUT_PATH.mkdir(parents=True, exist_ok=True)

# ==========================================
# 2. ANALYSE THREE MODELS
# ==========================================

for horizon in [1, 2, 3]:

    print("\n" + "=" * 55)
    print(f"FEATURE IMPORTANCE: DAY +{horizon}")
    print("=" * 55)

    # Load model
    artifact = joblib.load(
        MODEL_PATH / f"demand_forecast_day_{horizon}.pkl"
    )

    model = artifact["model"]
    features = artifact["features"]

    # Extract feature importance
    importance = pd.DataFrame({
        "Feature": features,
        "Importance": model.feature_importances_
    })

    importance = importance.sort_values(
        by="Importance",
        ascending=False
    )

    print(importance.to_string(index=False))

    # Save results
    importance.to_csv(
        OUTPUT_PATH / f"feature_importance_day_{horizon}.csv",
        index=False
    )

    # ==========================================
    # 3. VISUALISE FEATURE IMPORTANCE
    # ==========================================

    plt.figure(figsize=(10, 6))

    plt.barh(
        importance["Feature"],
        importance["Importance"]
    )

    plt.gca().invert_yaxis()

    plt.xlabel("Feature Importance")
    plt.ylabel("Features")

    plt.title(
        f"LightGBM Feature Importance - Day +{horizon}"
    )

    plt.tight_layout()

    plt.savefig(
        OUTPUT_PATH / f"feature_importance_day_{horizon}.png",
        dpi=300
    )

    plt.close()

print("\n========== FEATURE ANALYSIS COMPLETED ==========")
