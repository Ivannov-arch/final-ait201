
import joblib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

MODEL_FILE = ROOT / "models" / "demand_forecast_base.pkl"

print("\n========== VERIFYING BASE MODEL ==========")

artifact = joblib.load(MODEL_FILE)

print("Model name:", artifact["model_name"])
print("Algorithm:", artifact["algorithm"])
print("Holiday aware:", artifact["holiday_aware"])

for horizon, model_artifact in artifact["models"].items():

    print(f"\nDAY +{horizon}")
    print("Model:", type(model_artifact["model"]).__name__)
    print("Features:", len(model_artifact["features"]))
    print("Training rows:", model_artifact["training_rows"])
    print("Horizon metadata:", model_artifact["horizon"])

assert len(artifact["models"]) == 3

print("\nBASE MODEL VERIFICATION PASSED")
