# ─────────────────────────────────────────────
# [CELL 18] Inference Functions & FEFO Sorter (INDEPENDENT & REUSABLE)
# ─────────────────────────────────────────────

import os
import pandas as pd
import numpy as np
import joblib

# Path model default yang disesuaikan dengan struktur repositori lokal Anda
DEFAULT_MODEL_PATH = os.path.join("models", "spoilage_classifier.pkl")

# Kolom fitur yang digunakan saat pelatihan (agar urutan satu-satunya konsisten)
TRAINED_FEATURE_COLS = [
    'turnover_ratio', 'stock_pressure', 'log_unit_price', 'sales_rate',
    'cat_Bakery', 'cat_Beverages', 'cat_Dairy', 'cat_Fruits & Vegetables',
    'cat_Grains & Pulses', 'cat_Oils & Fats', 'cat_Seafood'
]

# Cache internal untuk menyimpan model agar tidak dimuat berulang-ulang
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

def preprocess_single_lot(lot: dict) -> pd.DataFrame:
    """Transforms a single lot dictionary into a model-compatible DataFrame row."""
    row = {col: 0.0 for col in TRAINED_FEATURE_COLS}

    # Masukkan fitur operasional murni (tanpa 'shelf_life_days' untuk mencegah leakage)
    row['turnover_ratio']   = float(lot.get('turnover_ratio', 0.0))
    row['stock_pressure']   = float(lot.get('stock_pressure', 1.0))
    
    # Menghitung log_unit_price dari unit_price jika tidak langsung disediakan
    if 'log_unit_price' in lot:
        row['log_unit_price'] = float(lot['log_unit_price'])
    else:
        unit_price = float(lot.get('unit_price', 0.0))
        row['log_unit_price'] = float(np.log1p(unit_price))
        
    row['sales_rate']       = float(lot.get('sales_rate', 0.0))

    # Menandai kategori (One-Hot Encoding secara manual)
    cat_key = f"cat_{lot.get('category', '')}"
    if cat_key in row:
        row[cat_key] = 1.0

    return pd.DataFrame([row])

def predict_spoilage_risk(lot: dict, model_path: str = DEFAULT_MODEL_PATH) -> dict:
    """Predicts spoilage risk level and confidence score for a single inventory lot.
    
    First, tries to load the ML classifier model from the given path.
    If the model is not found or fails to run, fallback to rule-based heuristics.
    """
    pkg = _load_model_package(model_path)
    shelf_life = float(lot.get('shelf_life_days', lot.get('days_to_expiry', 999)))

    if pkg is not None and "model" in pkg:
        try:
            model = pkg["model"]
            X_input = preprocess_single_lot(lot)
            label = str(model.predict(X_input)[0])
            score = float(model.predict_proba(X_input).max())
            return {"label": label, "score": round(score, 4)}
        except Exception:
            # Beralih ke fallback jika terjadi error pada saat prediksi model ML
            pass

    # Heuristic fallback (Jika model pkl tidak tersedia / gagal run)
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

def sort_by_fefo(batch_list: list[dict]) -> list[dict]:
    """Sorts inventory lots by First-Expired First-Out (FEFO) order."""
    if not batch_list:
        return []
    return sorted(batch_list, key=lambda x: pd.to_datetime(x.get('expiry_date', '9999-12-31'), errors='coerce'))

# ── Demo Penggunaan Mandiri (Inferensi Model ML / Fallback Heuristik) ──
sample_lot = {
    'turnover_ratio': 3.5,
    'stock_pressure': 0.8,
    'unit_price': 12.0,
    'sales_rate': 0.15,
    'category': 'Fruits & Vegetables',
    'shelf_life_days': 5
}

result = predict_spoilage_risk(sample_lot)
print(f"✅ Pengujian independen model: {result}")