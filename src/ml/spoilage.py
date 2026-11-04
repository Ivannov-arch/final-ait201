"""Spoilage Classifier and FEFO Sorter Module (Person 1 - Goal 1).

Provides:
- sort_by_fefo: Sorts inventory lots by expiration date (ascending).
- predict_spoilage_risk: Predicts spoilage risk level (HIGH/MODERATE/LOW)
  and confidence score using the trained model or a rule-based fallback.
"""

from __future__ import annotations

from datetime import datetime
import os
from typing import Any

try:
    import joblib
except ImportError:
    joblib = None

try:
    import numpy as np
except ImportError:
    np = None

try:
    import pandas as pd
except ImportError:
    pd = None

DEFAULT_MODEL_PATH = os.path.join("models", "spoilage_classifier.pkl")

# Cached model package
_MODEL_PACKAGE: dict[str, Any] | None = None


def _load_model_package(model_path: str = DEFAULT_MODEL_PATH) -> dict[str, Any] | None:
    """Loads the model package dictionary if available."""
    global _MODEL_PACKAGE
    if _MODEL_PACKAGE is not None:
        return _MODEL_PACKAGE

    if os.path.exists(model_path):
        try:
            loaded = joblib.load(model_path)
            if isinstance(loaded, dict) and "model" in loaded:
                _MODEL_PACKAGE = loaded
            else:
                _MODEL_PACKAGE = {"model": loaded, "feature_columns": []}
            return _MODEL_PACKAGE
        except Exception:
            return None
    return None


def sort_by_fefo(batch_list: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sorts a list of lot dictionaries by First-Expired First-Out (FEFO) order.

    Args:
        batch_list: List of dicts, each having an 'expiry_date' key (string or datetime).

    Returns:
        New sorted list with soonest expiration date first.
    """
    if not batch_list:
        return []

    def _parse_date(item: dict[str, Any]) -> str:
        d = item.get("expiry_date", "9999-12-31")
        return str(d)[:10]

    return sorted(batch_list, key=_parse_date)


def preprocess_single_lot(lot: dict[str, Any], feature_columns: list[str]) -> Any:
    """Transforms a single lot dictionary into a model-compatible DataFrame row."""
    if pd is None:
        raise RuntimeError("pandas is required for model inference")

    row = {col: 0.0 for col in feature_columns}

    row["shelf_life_days"] = float(lot.get("shelf_life_days", 0))
    row["turnover_ratio"] = float(lot.get("turnover_ratio", 0.0))
    row["stock_pressure"] = float(lot.get("stock_pressure", 1.0))
    unit_price = float(lot.get("unit_price_myr", 0.0))
    row["log_unit_price"] = float(
        lot.get("log_unit_price", np.log1p(unit_price) if np is not None else 0.0)
    )
    row["sales_rate"] = float(lot.get("sales_rate", 0.0))

    category = lot.get("category", "")
    cat_key = f"cat_{category}"
    if cat_key in row:
        row[cat_key] = 1.0

    return pd.DataFrame([row])


def predict_spoilage_risk(
    lot: dict[str, Any],
    model_path: str = DEFAULT_MODEL_PATH,
) -> dict[str, Any]:
    """Predicts spoilage risk level and confidence score for a single inventory lot.

    If the trained model (.pkl) is found, it uses the ML classifier.
    Otherwise, it defaults to a domain-rule heuristic:
    - shelf_life_days <= 7: HIGH
    - shelf_life_days <= 30: MODERATE
    - shelf_life_days > 30: LOW

    Args:
        lot: Dictionary representing an inventory lot.
        model_path: Optional path to the serialized model file.

    Returns:
        dict: {"label": "HIGH" | "MODERATE" | "LOW", "score": float (0.0 to 1.0)}
    """
    pkg = _load_model_package(model_path)
    shelf_life = float(lot.get("shelf_life_days", lot.get("days_to_expiry", 999)))

    if pkg is not None and "model" in pkg:
        model = pkg["model"]
        feature_cols = pkg.get("feature_columns", [])

        if feature_cols:
            X_input = preprocess_single_lot(lot, feature_cols)
            try:
                label = str(model.predict(X_input)[0])
                score = float(model.predict_proba(X_input).max())
                return {"label": label, "score": round(score, 4)}
            except Exception:
                pass

    # Heuristic fallback if model not loaded or error occurred
    if shelf_life <= 7:
        label = "HIGH"
        score = 0.90
    elif shelf_life <= 30:
        label = "MODERATE"
        score = 0.75
    else:
        label = "LOW"
        score = 0.95

    return {"label": label, "score": score}
