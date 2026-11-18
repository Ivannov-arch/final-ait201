"""
Option 2: Retrain Spoilage Risk Classifier with Dual Class-Weighting.
Weights: HIGH = 1.5, MODERATE = 2.6, LOW = 1.0 (Store-Compatible 19 Features).
Saves clean model package to models/spoilage_classifier_dual_weighted.pkl.
"""

import os
import joblib
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, f1_score, confusion_matrix, classification_report
import xgboost as xgb

ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = ROOT / "data" / "processed" / "7_perishable_goods_cleaned.csv"
MODEL_OUTPUT_PATH = ROOT / "models" / "spoilage_classifier_dual_weighted.pkl"
RANDOM_STATE = 42

print("Loading dataset from:", DATA_PATH)
df = pd.read_csv(DATA_PATH)

def bin_waste(w):
    if w == 0:
        return "LOW"
    elif w <= 25:
        return "MODERATE"
    else:
        return "HIGH"

y_str = df["waste_pct"].apply(bin_waste)
CLASSES = ["HIGH", "LOW", "MODERATE"]
CLASS_TO_INT = {"HIGH": 0, "LOW": 1, "MODERATE": 2}
INT_TO_CLASS = {0: "HIGH", 1: "LOW", 2: "MODERATE"}
y = np.array([CLASS_TO_INT[s] for s in y_str])

LEAKAGE_COLS = [
    "waste_pct", "units_sold", "units_wasted", "revenue",
    "profit", "waste_cost", "discount_pct", "markdown_applied", "was_spoiled",
]
df_clean = df.drop(columns=[c for c in LEAKAGE_COLS if c in df.columns]).copy()
df_clean["stock_pressure"] = (df_clean["initial_quantity"] / (df_clean["daily_demand"] + 1)).round(2)
CATEGORY_MAP = {"Produce": "Fruits & Vegetables"}
df_clean["category"] = df_clean["category"].replace(CATEGORY_MAP)

NUMERIC_COLS = [
    "initial_quantity", "base_price", "daily_demand",
    "days_until_expiry", "shelf_life_days",
    "day_of_week", "is_weekend", "month", "is_promoted",
    "stock_pressure",
]

# 19 Store-compatible features
df_encoded = pd.get_dummies(
    df_clean[NUMERIC_COLS + ["category"]],
    columns=["category"],
    prefix="category",
    drop_first=False
)

FEATURE_COLS = list(df_encoded.columns)
X = df_encoded.values

print(f"Features ({len(FEATURE_COLS)}): {FEATURE_COLS}")
print("Class counts:", dict(pd.Series(y_str).value_counts()))

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, stratify=y, random_state=RANDOM_STATE
)

scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled  = scaler.transform(X_test)

# Dual-weighting: Boost MODERATE (2.6) and HIGH (1.5) relative to LOW (1.0)
sample_weight_train = np.ones(len(y_train), dtype=float)
sample_weight_train[y_train == 0] = 1.5  # HIGH
sample_weight_train[y_train == 2] = 2.6  # MODERATE

print("Training Dual-Weighted XGBoost Classifier (Option 2)...")
model = xgb.XGBClassifier(
    n_estimators=150,
    max_depth=6,
    learning_rate=0.08,
    subsample=0.85,
    colsample_bytree=0.85,
    random_state=RANDOM_STATE,
    n_jobs=-1,
    eval_metric="mlogloss"
)
model.fit(X_train_scaled, y_train, sample_weight=sample_weight_train)

# Evaluation
y_pred = model.predict(X_test_scaled)
acc = accuracy_score(y_test, y_pred)
f1 = f1_score(y_test, y_pred, average="macro")
cm = confusion_matrix(y_test, y_pred, labels=[0, 1, 2])
rec_high = cm[0][0] / cm[0].sum()
rec_low  = cm[1][1] / cm[1].sum()
rec_mod  = cm[2][2] / cm[2].sum()

print("\n=== EVALUATION RESULTS (OPTION 2 MODEL) ===")
print(f"Accuracy    : {acc*100:.2f}%")
print(f"Macro F1    : {f1:.4f}")
print(f"Recall HIGH : {rec_high*100:.2f}%")
print(f"Recall MOD  : {rec_mod*100:.2f}%")
print(f"Recall LOW  : {rec_low*100:.2f}%")
print("\nClassification Report:\n", classification_report(y_test, y_pred, target_names=CLASSES, digits=4))

# Packaging
package = {
    "model": model,
    "scaler": scaler,
    "features": FEATURE_COLS,
    "classes": CLASSES,
    "class_to_int": CLASS_TO_INT,
    "int_to_class": INT_TO_CLASS,
    "model_type": "xgboost_dual_weighted",
    "feature_schema": "v3_store_compatible_no_region",
    "weights": {"HIGH": 1.5, "MODERATE": 2.6, "LOW": 1.0},
    "metrics": {
        "accuracy": float(acc),
        "f1_macro": float(f1),
        "recall_high": float(rec_high),
        "recall_mod": float(rec_mod),
        "recall_low": float(rec_low),
    }
}

os.makedirs(ROOT / "models", exist_ok=True)
joblib.dump(package, MODEL_OUTPUT_PATH, compress=3)
print(f"\nSaved Option 2 model package to: {MODEL_OUTPUT_PATH}")
