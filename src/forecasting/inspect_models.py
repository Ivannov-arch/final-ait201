
import joblib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = ROOT / "models"

for horizon in [1, 2, 3]:

    print("\n" + "=" * 55)
    print(f"INSPECTING FINAL MODEL: DAY +{horizon}")
    print("=" * 55)

    path = (
        MODEL_PATH
        / f"demand_forecast_final_day_{horizon}.pkl"
    )

    artifact = joblib.load(path)

    print("Artifact type:", type(artifact))

    if isinstance(artifact, dict):

        print("Artifact keys:", artifact.keys())

        model = artifact["model"]

        print("Model type:", type(model))
        print("Saved features:", artifact.get("features"))
        print("Horizon:", artifact.get("horizon"))
        print("Best iteration:", model.best_iteration_)

        print(
            "Family categories:",
            artifact.get("family_categories")
        )

    else:
        print("Model:", artifact)

print("\n========== MODEL INSPECTION COMPLETED ==========")
