"""
Spoilage Classifier — Inference Functions & FEFO Sorter
======================================================
Person 1: ML Spoilage Model & Two-Tier Risk Prediction
- Tier 1: Machine Learning Classifier (Trained on Perishable Goods, waste_pct target)
- Tier 2: Continuous Policy Engine (Category-aware exponential time-decay escalation)

Predicts spoilage risk level (HIGH, MODERATE, LOW) with calibrated confidence score.
"""

import os
import threading
import pandas as pd
import numpy as np
import joblib

# Default model paths
DEFAULT_MODEL_PATH = os.path.join("models", "spoilage_classifier.pkl")
DUAL_WEIGHTED_MODEL_PATH = os.path.join("models", "spoilage_classifier_dual_weighted.pkl")

# Store-compatible feature columns (Perishable Goods dataset v2 - 19 features, region-agnostic)
TRAINED_FEATURE_COLS = [
    'initial_quantity', 'base_price', 'daily_demand', 'days_until_expiry',
    'shelf_life_days', 'day_of_week', 'is_weekend', 'month', 'is_promoted',
    'stock_pressure',
    'category_Bakery', 'category_Beverages', 'category_Dairy', 'category_Deli',
    'category_Frozen_Meals', 'category_Fruits & Vegetables', 'category_Meat',
    'category_Ready_to_Eat', 'category_Seafood'
]

# Legacy feature columns support for backward compatibility with v1 model
LEGACY_FEATURE_COLS = [
    'turnover_ratio', 'stock_pressure', 'log_unit_price', 'sales_rate',
    'cat_Bakery', 'cat_Beverages', 'cat_Dairy', 'cat_Fruits & Vegetables',
    'cat_Grains & Pulses', 'cat_Oils & Fats', 'cat_Seafood'
]

# ── Category mapping (no-retrain bridge) ─────────────────────────────────────
# FreshGuard retail categories that have NO trained one-hot column are mapped
# onto the closest trained category with equivalent spoilage dynamics. This
# makes every category hit a real trained column instead of leaving all
# one-hots at 0 (which produced degenerate constant probabilities 0.5681).
CATEGORY_EQUIVALENCE = {
    # FreshGuard name        -> trained column name
    'Produce':          'Fruits & Vegetables',
    'Fruits':           'Fruits & Vegetables',
    'Vegetables':       'Fruits & Vegetables',
    'Bread':            'Bakery',
    'Pastry':           'Bakery',
    'Drinks':           'Beverages',
    'Fish':             'Seafood',
    'Meat':             'Meat',
    'Meats':            'Meat',
    'Beef':             'Meat',
    'Pork':             'Meat',
    'Poultry':          'Meat',
    'Chicken':          'Meat',
    'Frozen Foods':     'Frozen_Meals',
    'Frozen Meals':     'Frozen_Meals',
    'Prepared Food':    'Ready_to_Eat',
    'Prepared Foods':   'Ready_to_Eat',
    'Eggs':             'Dairy',   # refrigerated animal product, nearest trained dynamics
}

# Dry Goods / Shelf-Stable departments (non-perishable).
# The XGBoost model is trained exclusively on Perishable Goods
# (7_perishable_goods_cleaned.csv, waste_pct target). These categories are
# shelf-stable (1-2 year shelf life) with no microbial spoilage pathway,
# so they are scored by policy, not by the model.
SHELF_STABLE_CATEGORIES = {
    'Grains & Pulses', 'Oils & Fats', 'Grocery', 'Dry Goods', 'Pantry',
    'Snacks',
    'Liquor', 'Beer', 'Wine', 'Liquor, Wine, Beer',
}

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
_MODEL_PACKAGE_LOCK = threading.Lock()

def _load_model_package(model_path: str = DEFAULT_MODEL_PATH) -> dict | None:
    """Loads and caches the model package safely (thread-safe)."""
    global _MODEL_PACKAGE
    if _MODEL_PACKAGE is not None:
        return _MODEL_PACKAGE

    with _MODEL_PACKAGE_LOCK:
        # Re-check inside the lock: another thread may have loaded while this
        # one was waiting.
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
    # No-retrain bridge: map untrained FreshGuard categories onto the closest
    # trained one-hot column (see CATEGORY_EQUIVALENCE). Exact trained names
    # pass through unchanged.
    cat_raw = CATEGORY_EQUIVALENCE.get(cat_raw, cat_raw)

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

    df_row = pd.DataFrame([row], columns=feature_cols)
    if scaler is not None:
        return scaler.transform(df_row.values)
    return df_row.values

def apply_continuous_tier2(
    probs: dict[str, float],
    category: str,
    days_until_expiry: float,
    alpha: float = 0.20,
    mode: str = "hierarchical",
    alpha_low_to_mod: float = 0.40,
    alpha_mod_to_high: float = 0.35
) -> tuple[str, float, dict[str, float], float]:
    """Applies Tier 2 Risk Policy Escalation to model probabilities.

    Supports two primary modes:
      1. 'hierarchical' (Option 1 - Default Protective Decision Gate):
         - Protects & elevates HIGH: if P(HIGH) >= 0.40, u >= 0.55, or raw_argmax == HIGH -> HIGH.
         - Escalates aging items to MODERATE: if not HIGH and (P(MOD) >= 0.18 or u >= 0.15) -> MODERATE.
         - Preserves Recall HIGH >= 75% and elevates Recall MODERATE into the 30%+ range.
      2. 'cascading' (Option 2 - Continuous Cascading Escalation):
         - Cascades risk upwards: LOW -> MODERATE and MODERATE -> HIGH proportionally.
      3. 'continuous' (Legacy Continuous Shift):
         - Shifts probability mass from LOW directly to HIGH.

    Args:
        probs: Dict of raw class probabilities {'HIGH': p, 'MODERATE': p, 'LOW': p}
        category: Product category name
        days_until_expiry: Days remaining until expiration
        alpha: Intervention strength for legacy continuous mode
        mode: Policy mode ('hierarchical', 'cascading', or 'continuous')
        alpha_low_to_mod: Low-to-Moderate shift factor for cascading mode
        alpha_mod_to_high: Moderate-to-High shift factor for cascading mode

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

    if mode == "hierarchical":
        # Option 1: Hierarchical Decision Gate
        # Condition 1: HIGH protection & escalation
        is_high = (p_high >= 0.40) or (u >= 0.55) or (p_high >= p_low and p_high >= p_mod)
        
        # Condition 2: MODERATE escalation (if not HIGH)
        is_mod = (not is_high) and ((p_mod >= 0.18) or (u >= 0.15))
        
        if is_high:
            final_label = "HIGH"
            p_high_adj = max(p_high, 0.65)
            p_mod_adj = (1.0 - p_high_adj) * (p_mod / max(1e-6, p_mod + p_low))
            p_low_adj = 1.0 - p_high_adj - p_mod_adj
        elif is_mod:
            final_label = "MODERATE"
            p_mod_adj = max(p_mod, 0.55)
            p_low_adj = (1.0 - p_mod_adj) * 0.8
            p_high_adj = 1.0 - p_mod_adj - p_low_adj
        else:
            final_label = "LOW"
            p_low_adj = max(p_low, 0.60)
            p_mod_adj = (1.0 - p_low_adj) * 0.7
            p_high_adj = 1.0 - p_low_adj - p_mod_adj

        adjusted_probs = {
            'HIGH': round(float(p_high_adj), 4),
            'MODERATE': round(float(p_mod_adj), 4),
            'LOW': round(float(p_low_adj), 4)
        }
        final_score = adjusted_probs[final_label]
        return final_label, final_score, adjusted_probs, round(u, 4)

    elif mode == "cascading":
        # Option 2: Cascading Monotonic Escalation
        flow_m2h = alpha_mod_to_high * u * p_mod
        flow_l2m = alpha_low_to_mod * u * p_low
        flow_l2h = 0.10 * (u ** 1.5) * p_low

        p_high_new = p_high + flow_m2h + flow_l2h
        p_mod_new  = max(0.0, p_mod - flow_m2h + flow_l2m)
        p_low_new  = max(0.0, p_low - flow_l2m - flow_l2h)

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

    else:
        # Legacy Continuous Shift
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

def _predict_shelf_stable_risk(lot: dict, category: str, days_until_expiry: float) -> dict:
    """Policy-based risk for Dry Goods / Shelf-Stable departments (no ML).

    Non-perishable items (grains, pulses, oils, fats) cannot spoil
    microbiologically like dairy or meat, so they return a confident LOW
    risk regardless of DTE — unless the expiry date has already passed
    (DTE <= 0), which is a hard HIGH regardless of department.
    """
    if days_until_expiry <= 0:
        return {
            "label": "HIGH",
            "score": 0.95,
            "raw_label": "HIGH",
            "tier2_applied": False,
            "urgency_factor": 1.0,
            "probabilities": {"HIGH": 0.95, "MODERATE": 0.0, "LOW": 0.05},
            "department": "Dry Goods (Shelf-Stable)",
            "source": "policy_shelf_stable"
        }
    return {
        "label": "LOW",
        "score": 0.95,
        "raw_label": "LOW",
        "tier2_applied": False,
        "urgency_factor": 0.0,
        "probabilities": {"HIGH": 0.0, "MODERATE": 0.05, "LOW": 0.95},
        "department": "Dry Goods (Shelf-Stable)",
        "source": "policy_shelf_stable"
    }

def predict_spoilage_risk(
    lot: dict,
    model_path: str = DEFAULT_MODEL_PATH,
    apply_tier2: bool = True,
    alpha: float = 0.20,
    tier2_mode: str = "hierarchical"
) -> dict:
    """Predicts spoilage risk level and confidence score for a single inventory lot.

    Architecture:
      - Department split: Dry Goods / Shelf-Stable categories (Grains & Pulses,
        Oils & Fats) are scored by policy, not by the model — they are
        non-perishable and cannot spoil microbiologically.
      - Tier 1 (Perishable departments): XGBoost Classifier predicts base risk
        profile from inventory features.
      - Tier 2 (if apply_tier2=True): Risk policy escalation dynamically boosts
        urgency as days_until_expiry draws near based on category sensitivity tau.
        Mode 'hierarchical' (Option 1) elevates MOD to the 30%+ range while protecting HIGH.
        Mode 'cascading' (Option 2) cascades risk upwards from LOW to MOD to HIGH.

    Args:
        lot: Inventory lot dictionary.
        model_path: Path to serialized model package (.pkl).
        apply_tier2: Whether to apply Tier 2 time-decay policy (default True).
        alpha: Tier 2 sensitivity parameter (default 0.20).
        tier2_mode: Policy mode ('hierarchical' for Option 1, 'cascading' for Option 2).

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

    # ── Department Split: Dry Goods / Shelf-Stable bypass the ML model ──
    # The XGBoost model is trained only on Perishable Goods, so shelf-stable
    # categories never reach inference (their one-hot columns don't exist in
    # the trained schema anyway). Policy: LOW 95%, unless already expired.
    if category in SHELF_STABLE_CATEGORIES:
        return _predict_shelf_stable_risk(lot, category, days_until_expiry)

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
                    raw_probs, category, days_until_expiry, alpha=alpha, mode=tier2_mode
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
        'category': 'Bakery'
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
        'category': 'Bakery'
    }
    res_urgent = predict_spoilage_risk(lot_urgent)
    print(f"\n2. Critical Lot (Bakery DTE=1):")
    print(f"   Raw={res_urgent['raw_label']} -> Final={res_urgent['label']} | Score={res_urgent['score']} | Urgency={res_urgent['urgency_factor']}")
