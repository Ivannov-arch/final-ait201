"""
Spoilage Classifier — Inference Functions & FEFO Sorter
======================================================
Person 1: ML Spoilage Model & Two-Tier Risk Prediction
- Tier 1: Machine Learning Classifier (Trained on Perishable Goods, waste_pct target)
- Tier 2: Continuous Policy Engine (Category-aware exponential time-decay escalation)

Predicts spoilage risk level (HIGH, MODERATE, LOW) with calibrated confidence score.
"""

import os
import pandas as pd
import numpy as np
import joblib

# Default model path
DEFAULT_MODEL_PATH = os.path.join("models", "spoilage_classifier.pkl")

# Store-compatible feature columns (Perishable Goods dataset v2 - 24 features)
TRAINED_FEATURE_COLS = [
    'initial_quantity', 'base_price', 'daily_demand', 'days_until_expiry',
    'shelf_life_days', 'day_of_week', 'is_weekend', 'month', 'is_promoted',
    'stock_pressure',
    'category_Bakery', 'category_Beverages', 'category_Dairy', 'category_Deli',
    'category_Frozen_Meals', 'category_Fruits & Vegetables', 'category_Meat',
    'category_Ready_to_Eat', 'category_Seafood',
    'region_Midwest', 'region_Northeast', 'region_Southeast', 'region_Southwest',
    'region_West'
]

# Legacy feature columns support for backward compatibility with v1 model
LEGACY_FEATURE_COLS = [
    'turnover_ratio', 'stock_pressure', 'log_unit_price', 'sales_rate',
    'cat_Bakery', 'cat_Beverages', 'cat_Dairy', 'cat_Fruits & Vegetables',
    'cat_Grains & Pulses', 'cat_Oils & Fats', 'cat_Seafood'
]

# Category sensitivity tau (characteristic critical days for time-decay)
CATEGORY_TAU_DAYS = {
    'Bakery': 2.0,
    'Meat': 3.0,
    'Seafood': 3.0,
    'Dairy': 4.0,
    'Fruits & Vegetables': 4.0,
    'Deli': 3.0,
    'Ready_to_Eat': 3.0,
    'Frozen_Meals': 7.0,
    'Beverages': 7.0,
}

# Internal cache for model package to avoid redundant disk I/O
_MODEL_PACKAGE = None

def _load_model_package(model_path: str = DEFAULT_MODEL_PATH) -> dict | None:
    """Loads and caches the model package safely."""
    global _MODEL_PACKAGE
    if _MODEL_PACKAGE is not None:
        return _MODEL_PACKAGE

    if os.path.exists(model_path):
        try:
            loaded = joblib.load(model_path)
            if isinstance(loaded, dict) and "model" in loaded:
                _MODEL_PACKAGE = loaded
            else:
                _MODEL_PACKAGE = {"model": loaded}
            return _MODEL_PACKAGE
        except Exception:
            return None
    return None

def preprocess_single_lot(lot: dict, feature_cols: list | None = None, scaler=None) -> np.ndarray:
    """Transforms a single lot dictionary into a model-compatible scaled numpy array.

    Supports both current schema (Perishable Goods v2) and legacy schema (v1).
    """
    if feature_cols is None:
        feature_cols = TRAINED_FEATURE_COLS

    # Check if using legacy feature columns
    if 'turnover_ratio' in feature_cols:
        row = {col: 0.0 for col in feature_cols}
        row['turnover_ratio'] = float(lot.get('turnover_ratio', 0.0))
        row['stock_pressure'] = float(lot.get('stock_pressure', 1.0))
        if 'log_unit_price' in lot:
            row['log_unit_price'] = float(lot['log_unit_price'])
        else:
            unit_price = float(lot.get('unit_price', 0.0))
            row['log_unit_price'] = float(np.log1p(unit_price))
        row['sales_rate'] = float(lot.get('sales_rate', 0.0))
        cat_key = f"cat_{lot.get('category', '')}"
        if cat_key in row:
            row[cat_key] = 1.0
        df_row = pd.DataFrame([row])
        if scaler is not None:
            return scaler.transform(df_row.values)
        return df_row.values

    # New Store-Compatible Feature Schema (v2)
    qty = float(lot.get('initial_quantity', lot.get('Stock_Quantity', lot.get('quantity', 100.0))))
    price = float(lot.get('base_price', lot.get('Unit_Price', lot.get('unit_price', 10.0))))
    demand = float(lot.get('daily_demand', lot.get('Sales_Volume', lot.get('demand', 10.0))))
    dte = float(lot.get('days_until_expiry', lot.get('days_to_expiry', lot.get('shelf_life_days', 14.0))))
    shelf_life = float(lot.get('shelf_life_days', lot.get('shelf_life', 30.0)))
    day_of_week = int(lot.get('day_of_week', 0))
    is_weekend = int(lot.get('is_weekend', 0))
    month = int(lot.get('month', 6))
    is_promoted = int(lot.get('is_promoted', 0))

    if 'stock_pressure' in lot:
        stock_pressure = float(lot['stock_pressure'])
    else:
        stock_pressure = round(qty / (demand + 1.0), 2)

    cat_raw = str(lot.get('category', lot.get('Category', ''))).strip()
    if cat_raw == 'Produce':
        cat_raw = 'Fruits & Vegetables'

    region_raw = str(lot.get('region', lot.get('Region', 'Midwest'))).strip()

    row = {col: 0.0 for col in feature_cols}
    if 'initial_quantity' in row: row['initial_quantity'] = qty
    if 'base_price' in row:       row['base_price'] = price
    if 'daily_demand' in row:     row['daily_demand'] = demand
    if 'days_until_expiry' in row: row['days_until_expiry'] = dte
    if 'shelf_life_days' in row:  row['shelf_life_days'] = shelf_life
    if 'day_of_week' in row:      row['day_of_week'] = float(day_of_week)
    if 'is_weekend' in row:       row['is_weekend'] = float(is_weekend)
    if 'month' in row:            row['month'] = float(month)
    if 'is_promoted' in row:      row['is_promoted'] = float(is_promoted)
    if 'stock_pressure' in row:   row['stock_pressure'] = stock_pressure

    cat_col = f"category_{cat_raw}"
    if cat_col in row:
        row[cat_col] = 1.0

    reg_col = f"region_{region_raw}"
    if reg_col in row:
        row[reg_col] = 1.0

    df_row = pd.DataFrame([row], columns=feature_cols)
    if scaler is not None:
        return scaler.transform(df_row.values)
    return df_row.values

def apply_continuous_tier2(
    probs: dict[str, float],
    category: str,
    days_until_expiry: float,
    alpha: float = 0.10
) -> tuple[str, float, dict[str, float], float]:
    """Applies Tier 2 Continuous Bayesian Time-Decay Escalation to model probabilities.

    Formulation:
        u = exp(-dte / tau_c)  in [0, 1]
        P'(HIGH) = (P(HIGH) + alpha * u) / Z
        P'(LOW)  = max(0, P(LOW) - alpha * u) / Z
        P'(MOD)  = P(MOD) / Z

    Args:
        probs: Dict of raw class probabilities {'HIGH': p, 'MODERATE': p, 'LOW': p}
        category: Product category name
        days_until_expiry: Days remaining until expiration
        alpha: Intervention strength (default 0.10 for balanced accuracy-recall trade-off)

    Returns:
        tuple: (final_label, final_score, adjusted_probs, urgency_factor)
    """
    cat_norm = 'Fruits & Vegetables' if category == 'Produce' else category
    tau = CATEGORY_TAU_DAYS.get(cat_norm, 4.0)

    # Time urgency decay: 1.0 when DTE=0, decays exponentially as DTE increases
    dte_clamped = max(0.0, float(days_until_expiry))
    u = float(np.exp(-dte_clamped / tau))

    p_high = float(probs.get('HIGH', 0.0))
    p_mod  = float(probs.get('MODERATE', 0.0))
    p_low  = float(probs.get('LOW', 0.0))

    # Continuous shift from LOW to HIGH
    shift = alpha * u
    p_high_new = p_high + shift
    p_low_new  = max(0.0, p_low - shift)
    p_mod_new  = p_mod

    total = p_high_new + p_mod_new + p_low_new
    if total > 0:
        p_high_new /= total
        p_mod_new  /= total
        p_low_new  /= total

    adjusted_probs = {
        'HIGH': round(p_high_new, 4),
        'MODERATE': round(p_mod_new, 4),
        'LOW': round(p_low_new, 4)
    }

    final_label = max(adjusted_probs, key=adjusted_probs.get)
    final_score = adjusted_probs[final_label]

    return final_label, final_score, adjusted_probs, round(u, 4)

def predict_spoilage_risk(
    lot: dict,
    model_path: str = DEFAULT_MODEL_PATH,
    apply_tier2: bool = True,
    alpha: float = 0.10
) -> dict:
    """Predicts spoilage risk level and confidence score for a single inventory lot.

    Architecture:
      - Tier 1: Random Forest Classifier predicts base risk profile from inventory features.
      - Tier 2 (if apply_tier2=True): Continuous time-decay escalation dynamically boosts
        urgency as days_until_expiry draws near based on category sensitivity tau.

    Args:
        lot: Inventory lot dictionary.
        model_path: Path to serialized model package (.pkl).
        apply_tier2: Whether to apply continuous Tier 2 time-decay policy (default True).
        alpha: Tier 2 time-decay sensitivity parameter (default 0.10).

    Returns:
        dict: {
            "label": "HIGH" | "MODERATE" | "LOW",
            "score": float,
            "raw_label": "HIGH" | "MODERATE" | "LOW",
            "tier2_applied": bool,
            "urgency_factor": float
        }
    """
    pkg = _load_model_package(model_path)
    days_until_expiry = float(lot.get('days_until_expiry', lot.get('days_to_expiry', lot.get('shelf_life_days', 999))))
    category = str(lot.get('category', lot.get('Category', 'Unknown'))).strip()

    if pkg is not None and "model" in pkg:
        try:
            model = pkg["model"]
            feature_cols = pkg.get("features", pkg.get("feature_columns", TRAINED_FEATURE_COLS))
            scaler = pkg.get("scaler")
            X_input = preprocess_single_lot(lot, feature_cols=feature_cols, scaler=scaler)

            # Resolve class string labels
            probs_arr = model.predict_proba(X_input)[0]
            if "classes" in pkg and isinstance(pkg["classes"][0], str):
                class_names = pkg["classes"]
            elif "int_to_class" in pkg:
                class_names = [pkg["int_to_class"].get(i, f"class_{i}") for i in range(len(probs_arr))]
            elif hasattr(model, "classes_") and isinstance(model.classes_[0], str):
                class_names = list(model.classes_)
            else:
                class_names = ["HIGH", "LOW", "MODERATE"]

            raw_probs = {cls_name: float(p) for cls_name, p in zip(class_names, probs_arr)}

            raw_label = max(raw_probs, key=raw_probs.get)
            raw_score = round(raw_probs[raw_label], 4)

            if apply_tier2:
                final_label, final_score, adj_probs, u = apply_continuous_tier2(
                    raw_probs, category, days_until_expiry, alpha=alpha
                )
                return {
                    "label": final_label,
                    "score": final_score,
                    "raw_label": raw_label,
                    "tier2_applied": True,
                    "urgency_factor": u,
                    "probabilities": adj_probs
                }

            return {
                "label": raw_label,
                "score": raw_score,
                "raw_label": raw_label,
                "tier2_applied": False,
                "urgency_factor": 0.0,
                "probabilities": raw_probs
            }
        except Exception:
            # Fallback if prediction fails
            pass

    # Heuristic fallback (if model pkl unavailable or fails)
    shelf_life = days_until_expiry
    if shelf_life <= 7:
        label = "HIGH"
        score = 0.90
    elif shelf_life <= 30:
        label = "MODERATE"
        score = 0.75
    else:
        label = "LOW"
        score = 0.95

    return {
        "label": label,
        "score": score,
        "raw_label": label,
        "tier2_applied": False,
        "urgency_factor": 1.0 if shelf_life <= 7 else 0.0
    }

def sort_by_fefo(batch_list: list[dict]) -> list[dict]:
    """Sorts inventory lots by First-Expired First-Out (FEFO) order."""
    if not batch_list:
        return []
    return sorted(batch_list, key=lambda x: pd.to_datetime(x.get('expiration_date', x.get('expiry_date', '9999-12-31')), errors='coerce'))

# ── Demo / Test ──
if __name__ == "__main__":
    print("=== Demo Inferences with Continuous Tier 2 ===")

    # Test Case 1: Fresh Bakery with 20 days DTE (Safe, no urgency)
    lot_safe = {
        'initial_quantity': 50,
        'base_price': 8.0,
        'daily_demand': 15.0,
        'days_until_expiry': 20,
        'shelf_life_days': 25,
        'category': 'Bakery',
        'region': 'Midwest'
    }
    res_safe = predict_spoilage_risk(lot_safe)
    print(f"\n1. Safe Lot (Bakery DTE=20):")
    print(f"   Label={res_safe['label']} | Score={res_safe['score']} | Urgency={res_safe['urgency_factor']}")

    # Test Case 2: Bakery with only 1 day remaining (Critical, Tier 2 escalation triggers)
    lot_urgent = {
        'initial_quantity': 50,
        'base_price': 8.0,
        'daily_demand': 15.0,
        'days_until_expiry': 1,
        'shelf_life_days': 5,
        'category': 'Bakery',
        'region': 'Midwest'
    }
    res_urgent = predict_spoilage_risk(lot_urgent)
    print(f"\n2. Critical Lot (Bakery DTE=1):")
    print(f"   Raw={res_urgent['raw_label']} -> Final={res_urgent['label']} | Score={res_urgent['score']} | Urgency={res_urgent['urgency_factor']}")
