"""
FreshGuard — Final Spoilage Risk Classifier Training
=====================================================
Architecture : Single-Tier Dual-Weighted XGBoost
Best model   : XGBoost (Dual-Weighted) — Macro F1 0.6021, MODERATE Recall 60.06%
Output       : models/spoilage_classifier_final.pkl

Weights chosen from ablation study:
  HIGH     = 1.5  (penalise missed HIGH-risk items)
  MODERATE = 2.6  (fix near-zero recall on minority boundary class)
  LOW      = 1.0  (majority class, baseline)
"""

import os
import joblib
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    accuracy_score, f1_score,
    confusion_matrix, classification_report
)
import xgboost as xgb

# ── Paths ────────────────────────────────────────────────────────────────────
ROOT       = Path(__file__).resolve().parents[2]
DATA_PATH  = ROOT / "data" / "processed" / "7_perishable_goods_cleaned.csv"
MODEL_PATH = ROOT / "models" / "spoilage_classifier_final.pkl"
SEED       = 42

# ── Load Data ─────────────────────────────────────────────────────────────────
print(f"[1/5] Loading data from: {DATA_PATH}")
df = pd.read_csv(DATA_PATH)
print(f"      Rows: {len(df):,}  |  Columns: {df.shape[1]}")

# ── Target Labels from Realized Waste Outcomes ───────────────────────────────
# Labels derived from post-sale waste_pct ONLY (not from DTE — avoids circularity)
def label_waste(w):
    if w == 0:
        return "LOW"
    elif w <= 25:
        return "MODERATE"
    else:
        return "HIGH"

y_str = df["waste_pct"].apply(label_waste)
print(f"\n[2/5] Class distribution:")
for cls, cnt in y_str.value_counts().items():
    print(f"      {cls:10s}: {cnt:6,}  ({cnt/len(y_str)*100:.2f}%)")

CLASSES      = ["HIGH", "LOW", "MODERATE"]
CLASS_TO_INT = {"HIGH": 0, "LOW": 1, "MODERATE": 2}
INT_TO_CLASS = {0: "HIGH", 1: "LOW", 2: "MODERATE"}
y = np.array([CLASS_TO_INT[s] for s in y_str])

# ── Feature Engineering ───────────────────────────────────────────────────────
# Drop all post-sale outcome columns (leakage prevention)
LEAKAGE_COLS = [
    "waste_pct", "units_sold", "units_wasted", "revenue",
    "profit", "waste_cost", "discount_pct", "markdown_applied", "was_spoiled",
]
df_clean = df.drop(columns=[c for c in LEAKAGE_COLS if c in df.columns]).copy()

# Engineer velocity-cover feature: how much stock relative to daily demand
df_clean["stock_pressure"] = (
    df_clean["initial_quantity"] / (df_clean["daily_demand"] + 1)
).round(2)

# Normalize category taxonomy for Malaysian portability
df_clean["category"] = df_clean["category"].replace({"Produce": "Fruits & Vegetables"})

# 19 store-compatible numeric + one-hot category features
NUMERIC_COLS = [
    "initial_quantity", "base_price", "daily_demand",
    "days_until_expiry", "shelf_life_days",
    "day_of_week", "is_weekend", "month", "is_promoted",
    "stock_pressure",
]
df_encoded = pd.get_dummies(
    df_clean[NUMERIC_COLS + ["category"]],
    columns=["category"],
    prefix="category",
    drop_first=False
)
FEATURE_COLS = list(df_encoded.columns)
X = df_encoded.values
print(f"\n[3/5] Feature set: {len(FEATURE_COLS)} features")

# ── Train / Test Split ────────────────────────────────────────────────────────
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, stratify=y, random_state=SEED
)
print(f"      Train: {len(X_train):,}  |  Test: {len(X_test):,}")

scaler = StandardScaler()
X_train_sc = scaler.fit_transform(X_train)
X_test_sc  = scaler.transform(X_test)

# ── Dual Class-Weighting ──────────────────────────────────────────────────────
# Applies asymmetric sample weights directly during gradient boosting
# → forces XGBoost to penalise false negatives on MODERATE/HIGH at tree-split level
W_HIGH     = 1.5
W_MODERATE = 2.6
W_LOW      = 1.0

sample_weights = np.ones(len(y_train), dtype=float)
sample_weights[y_train == CLASS_TO_INT["HIGH"]]     = W_HIGH
sample_weights[y_train == CLASS_TO_INT["MODERATE"]] = W_MODERATE
sample_weights[y_train == CLASS_TO_INT["LOW"]]      = W_LOW

# ── Train Model ───────────────────────────────────────────────────────────────
print(f"\n[4/5] Training Dual-Weighted XGBoost ...")
print(f"      Weights → HIGH: {W_HIGH}  MODERATE: {W_MODERATE}  LOW: {W_LOW}")

model = xgb.XGBClassifier(
    n_estimators=150,
    max_depth=6,
    learning_rate=0.08,
    subsample=0.85,
    colsample_bytree=0.85,
    eval_metric="mlogloss",
    random_state=SEED,
    n_jobs=-1,
)
model.fit(X_train_sc, y_train, sample_weight=sample_weights)

# ── Evaluate ──────────────────────────────────────────────────────────────────
y_pred = model.predict(X_test_sc)
acc    = accuracy_score(y_test, y_pred)
f1     = f1_score(y_test, y_pred, average="macro")
f1_w   = f1_score(y_test, y_pred, average="weighted")
cm     = confusion_matrix(y_test, y_pred, labels=[0, 1, 2])

rec_high = cm[0, 0] / cm[0].sum()
rec_low  = cm[1, 1] / cm[1].sum()
rec_mod  = cm[2, 2] / cm[2].sum()

print("\n" + "="*52)
print("  EVALUATION RESULTS — Final Spoilage Classifier")
print("="*52)
print(f"  Accuracy        : {acc*100:.2f}%")
print(f"  Macro F1        : {f1:.4f}")
print(f"  Weighted F1     : {f1_w:.4f}")
print(f"  Recall HIGH     : {rec_high*100:.2f}%")
print(f"  Recall MODERATE : {rec_mod*100:.2f}%  ← key metric")
print(f"  Recall LOW      : {rec_low*100:.2f}%")
print("="*52)
print("\nFull Classification Report:")
print(classification_report(y_test, y_pred, target_names=CLASSES, digits=4))

# ── Save Model Package ────────────────────────────────────────────────────────
package = {
    "model":          model,
    "scaler":         scaler,
    "features":       FEATURE_COLS,
    "classes":        CLASSES,
    "class_to_int":   CLASS_TO_INT,
    "int_to_class":   INT_TO_CLASS,
    "model_type":     "xgboost_single_tier_dual_weighted",
    "feature_schema": "v3_store_compatible_19features",
    "weights":        {"HIGH": W_HIGH, "MODERATE": W_MODERATE, "LOW": W_LOW},
    "metrics": {
        "accuracy":    float(acc),
        "f1_macro":    float(f1),
        "f1_weighted": float(f1_w),
        "recall_high": float(rec_high),
        "recall_mod":  float(rec_mod),
        "recall_low":  float(rec_low),
    },
}

os.makedirs(ROOT / "models", exist_ok=True)
joblib.dump(package, MODEL_PATH, compress=3)
print(f"\n[5/5] Model saved to: {MODEL_PATH}")
