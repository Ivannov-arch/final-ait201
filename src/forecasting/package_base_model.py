
import joblib
from pathlib import Path
from datetime import datetime

# ==========================================
# 1. PROJECT PATHS
# ==========================================

ROOT = Path(__file__).resolve().parents[2]

MODEL_PATH = ROOT / "models"

OUTPUT_FILE = MODEL_PATH / "demand_forecast_base.pkl"

# ==========================================
# 2. LOAD THREE FINAL MODELS
# ==========================================

print("\n========== PACKAGING BASE FORECAST MODEL ==========")

horizon_models = {}

for horizon in [1, 2, 3]:

    model_file = (
        MODEL_PATH /
        f"demand_forecast_final_day_{horizon}.pkl"
    )

    if not model_file.exists():
        raise FileNotFoundError(
            f"Missing model: {model_file}"
        )

    artifact = joblib.load(model_file)

    if artifact["horizon"] != horizon:
        raise ValueError("Model horizon mismatch.")

    horizon_models[horizon] = artifact

    print(f"Day +{horizon}: Loaded successfully")

# ==========================================
# 3. CREATE MODEL REGISTRY
# ==========================================

base_artifact = {
    "model_name": "FreshGuard LightGBM Demand Forecast",
    "version": "1.0",
    "algorithm": "LightGBM",
    "forecast_horizons": [1, 2, 3],
    "holiday_aware": False,
    "models": horizon_models,
    "created_at": datetime.now().isoformat()
}

# ==========================================
# 4. SAVE BASE ARTIFACT
# ==========================================

joblib.dump(base_artifact, OUTPUT_FILE)

print("\nBase forecasting artifact saved:")
print(OUTPUT_FILE)

print("\nModels included:", len(base_artifact["models"]))

print("\n========== PACKAGING COMPLETED ==========")
