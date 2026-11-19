"""
Spoilage Risk Classifier - Dual Class-Weighting vs Unweighted Ablation Benchmark
=================================================================================
Ablation Study: Evaluates the impact of Dual Class-Weighting against Standard Unweighted Training.
Compares 10 Configurations (5 Base Architectures x 2 Weighting Strategies):

1. Unweighted Baseline (Standard Class Weights):
   - All sample weights = 1.0 (sample_weight = None)
2. Dual Class-Weighting Technique:
   - HIGH     : 1.5 (Penalizes false negatives on spoiled goods)
   - MODERATE : 2.6 (Substantially mitigates minority-class penalty, elevating early markdown warnings)
   - LOW      : 1.0 (Baseline safe inventory)

Evaluated Base Architectures (19 Store-Compatible Features):
1. XGBoost
   - Hyperparameters: n_estimators=150, max_depth=6, learning_rate=0.08, subsample=0.85, colsample_bytree=0.85
2. Random Forest
   - Hyperparameters: n_estimators=100, max_depth=None, min_samples_leaf=2, random_state=42
3. Logistic Regression
   - Hyperparameters: max_iter=1000, random_state=42 (features standard-scaled)
4. Decision Tree
   - Hyperparameters: Default (random_state=42)
5. Support Vector Machine (SVM)
   - Hyperparameters: Linear Support Vector Classifier with probability calibration, random_state=42 (features standard-scaled)

Output Directory:
All publication-quality diagrams (.png) and summary metrics (.csv) are saved to:
D:\\hahaha\\HUAHUAHUA\\Evaluasi\\
"""

import os
import sys
import time
import warnings
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# Machine Learning Libraries
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.svm import LinearSVC
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    classification_report,
    confusion_matrix
)
import xgboost as xgb

warnings.filterwarnings("ignore")

# Configure Visualization Themes & Font Hierarchies
sns.set_theme(style="whitegrid")
plt.rcParams["font.family"] = "sans-serif"
plt.rcParams["font.size"] = 11
plt.rcParams["axes.titlesize"] = 13
plt.rcParams["axes.labelsize"] = 11
plt.rcParams["xtick.labelsize"] = 10
plt.rcParams["ytick.labelsize"] = 10

# ==============================================================================
# 1. DIRECTORY CONFIGURATION & DATA INGESTION
# ==============================================================================
OUTPUT_DIR = Path("D:/hahaha/HUAHUAHUA/Evaluasi").resolve()
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Adaptive resolution of the dataset path
POSSIBLE_PATHS = [
    Path("D:/hahaha/food-cleaning-ait201/data/processed/7_perishable_goods_cleaned.csv"),
    Path("../data/processed/7_perishable_goods_cleaned.csv"),
    Path("data/processed/7_perishable_goods_cleaned.csv"),
    Path("7_perishable_goods_cleaned.csv"),
]

DATA_PATH = None
for p in POSSIBLE_PATHS:
    if p.exists():
        DATA_PATH = p.resolve()
        break

if DATA_PATH is None:
    raise FileNotFoundError("Dataset 7_perishable_goods_cleaned.csv not found in the checked locations.")

print(f"[1/6] Loading dataset from: {DATA_PATH}")
df = pd.read_csv(DATA_PATH)
print(f"      Initial dataset dimensions: {df.shape}")

# ==============================================================================
# 2. TARGET BINNING & 19 STORE-COMPATIBLE FEATURE EXTRACTION
# ==============================================================================
# Target definition (outcome variable derived from waste_pct)
# LOW: 0% waste | MODERATE: 1-25% waste | HIGH: > 25% waste
def bin_waste(w):
    if w == 0:
        return "LOW"
    elif w <= 25:
        return "MODERATE"
    else:
        return "HIGH"

y_str = df["waste_pct"].apply(bin_waste).values
CLASSES = ["HIGH", "LOW", "MODERATE"]
CLASS_TO_INT = {"HIGH": 0, "LOW": 1, "MODERATE": 2}
INT_TO_CLASS = {0: "HIGH", 1: "LOW", 2: "MODERATE"}
y = np.array([CLASS_TO_INT[s] for s in y_str])

# Exclude Data Leakage, Sensor, and Metadata Columns
LEAKAGE_COLS = [
    "waste_pct", "units_sold", "units_wasted", "revenue",
    "profit", "profit_margin_pct", "waste_cost", "discount_pct",
    "markdown_applied", "was_spoiled", "selling_price"
]
META_COLS = [
    "record_id", "product_id", "product_name", "store_id", "supplier_id",
    "transaction_date", "expiration_date"
]
SENSOR_COLS = [
    "storage_temp", "temp_deviation", "temp_abuse_events", "distribution_hours",
    "handling_score", "packaging_score", "demand_variability", "spoilage_risk",
    "spoilage_sensitivity", "supplier_score", "quality_grade", "cost_price",
    "days_remaining_at_purchase", "region"
]

DROP_COLS = [c for c in (LEAKAGE_COLS + META_COLS + SENSOR_COLS) if c in df.columns]
df_clean = df.drop(columns=DROP_COLS).copy()

# Domain Feature Engineering: Stock Pressure Ratio
df_clean["stock_pressure"] = (df_clean["initial_quantity"] / (df_clean["daily_demand"] + 1)).round(2)
df_clean["category"] = df_clean["category"].replace({"Produce": "Fruits & Vegetables"})

NUMERIC_COLS = [
    "initial_quantity", "base_price", "daily_demand",
    "days_until_expiry", "shelf_life_days",
    "day_of_week", "is_weekend", "month", "is_promoted",
    "stock_pressure"
]

# 19 Store-Compatible One-Hot Encoded Features
df_encoded = pd.get_dummies(
    df_clean[NUMERIC_COLS + ["category"]],
    columns=["category"],
    prefix="category",
    drop_first=False
)
FEATURE_COLS = list(df_encoded.columns)
X = df_encoded.values

print(f"[2/6] Clean store-compatible feature count: {len(FEATURE_COLS)}")

# ==============================================================================
# 3. STRATIFIED TRAIN-TEST SPLIT, SCALING & DUAL CLASS-WEIGHTING
# ==============================================================================
RANDOM_STATE = 42
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.20, stratify=y, random_state=RANDOM_STATE
)

# Standard scaling for linear and margin-based models (Logistic Regression, SVM)
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled  = scaler.transform(X_test)

# Dual Class-Weighting Strategy vs Unweighted:
# - Unweighted: All sample weights = 1.0 (None)
# - Dual-Weighted: HIGH = 1.5, MODERATE = 2.6, LOW = 1.0
DUAL_WEIGHTS = {
    0: 1.5,  # HIGH
    1: 1.0,  # LOW
    2: 2.6   # MODERATE
}

sample_weight_dual = np.ones(len(y_train), dtype=float)
for c_int, w_val in DUAL_WEIGHTS.items():
    sample_weight_dual[y_train == c_int] = w_val

print(f"[3/6] Dataset split completed -> Train: {X_train.shape[0]:,}, Test: {X_test.shape[0]:,}")
print(f"      Comparing Unweighted (None) vs Dual-Weighted (HIGH: 1.5, MOD: 2.6, LOW: 1.0)")

# ==============================================================================
# 4. MODEL ARCHITECTURES INITIALIZATION (5 SPECIFIED ALGORITHMS)
# ==============================================================================
def get_fresh_model(model_name):
    """Instantiate fresh model instances with identical hyperparameters."""
    if model_name == "XGBoost":
        return xgb.XGBClassifier(
            n_estimators=150,
            max_depth=6,
            learning_rate=0.08,
            subsample=0.85,
            colsample_bytree=0.85,
            random_state=RANDOM_STATE,
            n_jobs=-1,
            eval_metric="mlogloss"
        ), False
    elif model_name == "Random Forest":
        return RandomForestClassifier(
            n_estimators=100,
            max_depth=None,
            min_samples_leaf=2,
            random_state=RANDOM_STATE,
            n_jobs=-1
        ), False
    elif model_name == "Logistic Regression":
        return LogisticRegression(
            max_iter=1000,
            random_state=RANDOM_STATE
        ), True
    elif model_name == "Decision Tree":
        return DecisionTreeClassifier(
            random_state=RANDOM_STATE
        ), False
    elif model_name == "SVM":
        return CalibratedClassifierCV(
            estimator=LinearSVC(
                dual="auto",
                max_iter=2000,
                random_state=RANDOM_STATE
            )
        ), True
    else:
        raise ValueError(f"Unknown model name: {model_name}")

model_architectures = ["XGBoost", "Random Forest", "Logistic Regression", "Decision Tree", "SVM"]
weighting_schemes = [
    ("Unweighted", None),
    ("Dual-Weighted", sample_weight_dual)
]

# ==============================================================================
# 5. TRAINING & EVALUATION ABLATION PIPELINE (10 CONFIGURATIONS)
# ==============================================================================
print("\n[4/6] Executing Ablation Benchmark: Dual-Weighted vs Unweighted...")

results = []
confusion_matrices = {}

for m_name in model_architectures:
    for w_name, s_weight in weighting_schemes:
        config_name = f"{m_name} ({w_name})"
        model, use_scaled = get_fresh_model(m_name)
        
        X_tr = X_train_scaled if use_scaled else X_train
        X_te = X_test_scaled if use_scaled else X_test
        
        print(f"      Training {config_name:32s} ...", end="", flush=True)
        t0 = time.time()
        
        if s_weight is not None:
            model.fit(X_tr, y_train, sample_weight=s_weight)
        else:
            model.fit(X_tr, y_train)
            
        duration = time.time() - t0
        print(f" Done ({duration:.2f}s)")
        
        pred = model.predict(X_te)
        
        acc = accuracy_score(y_test, pred)
        f1_m = f1_score(y_test, pred, average="macro")
        f1_w = f1_score(y_test, pred, average="weighted")
        f1_c = f1_score(y_test, pred, average=None, labels=[0, 1, 2])
        rec_c = recall_score(y_test, pred, average=None, labels=[0, 1, 2])
        prec_c = precision_score(y_test, pred, average=None, labels=[0, 1, 2], zero_division=0)
        cm = confusion_matrix(y_test, pred, labels=[0, 1, 2])
        
        confusion_matrices[config_name] = cm
        
        results.append({
            "Configuration": config_name,
            "Base Model": m_name,
            "Weighting Scheme": w_name,
            "Accuracy": acc,
            "Macro F1": f1_m,
            "Weighted F1": f1_w,
            "Recall HIGH": rec_c[0],
            "Recall LOW": rec_c[1],
            "Recall MODERATE": rec_c[2],
            "Precision HIGH": prec_c[0],
            "Precision LOW": prec_c[1],
            "Precision MODERATE": prec_c[2],
            "F1 HIGH": f1_c[0],
            "F1 LOW": f1_c[1],
            "F1 MODERATE": f1_c[2],
            "Training Time (s)": duration
        })

df_results = pd.DataFrame(results)

print("\n[5/6] Ablation Summary Table (Unweighted vs Dual-Weighted):")
summary_cols = ["Configuration", "Accuracy", "Macro F1", "Recall HIGH", "Recall MODERATE", "Recall LOW"]
print(df_results[summary_cols].round(4).to_string(index=False))

# Export Summary CSV
csv_out = OUTPUT_DIR / "dual_weighting_ablation_summary.csv"
df_results.round(4).to_csv(csv_out, index=False)
print(f"\n      Full metrics CSV exported to: {csv_out}")

# ==============================================================================
# 6. GENERATE ESSENTIAL ABLATION COMPARISON DIAGRAMS (.PNG)
# ==============================================================================
print(f"\n[6/6] Generating Publication-Quality Ablation Diagrams in {OUTPUT_DIR} ...")

# ------------------------------------------------------------------------------
# DIAGRAM 1: Macro F1 Gain: Unweighted vs Dual-Weighted
# ------------------------------------------------------------------------------
plt.figure(figsize=(11, 5.5))
bar_width = 0.35
x_idx = np.arange(len(model_architectures))

unweighted_f1 = df_results[df_results["Weighting Scheme"] == "Unweighted"]["Macro F1"].values
dual_weighted_f1 = df_results[df_results["Weighting Scheme"] == "Dual-Weighted"]["Macro F1"].values

plt.bar(x_idx - bar_width/2, unweighted_f1, width=bar_width, label="Unweighted Baseline", color="#95a5a6", edgecolor="black", alpha=0.9)
plt.bar(x_idx + bar_width/2, dual_weighted_f1, width=bar_width, label="Dual Class-Weighting", color="#27ae60", edgecolor="black", alpha=0.9)

for i in range(len(model_architectures)):
    delta = dual_weighted_f1[i] - unweighted_f1[i]
    sign = "+" if delta >= 0 else ""
    plt.annotate(f"{unweighted_f1[i]:.4f}", (x_idx[i] - bar_width/2, unweighted_f1[i] + 0.01), ha="center", fontsize=8, fontweight="bold")
    plt.annotate(f"{dual_weighted_f1[i]:.4f}\n({sign}{delta:.3f})", (x_idx[i] + bar_width/2, dual_weighted_f1[i] + 0.01), ha="center", fontsize=8, fontweight="bold", color="#1e8449")

plt.title("Ablation Study: Macro F1 Gain (Unweighted vs Dual Class-Weighting)", pad=15, fontweight="bold")
plt.xlabel("Machine Learning Architecture", fontweight="bold")
plt.ylabel("Macro F1 Score", fontweight="bold")
plt.xticks(x_idx, model_architectures, fontweight="bold")
plt.ylim(0, 0.75)
plt.legend(loc="upper right")
plt.grid(axis="y", linestyle="--", alpha=0.5)

plt.tight_layout()
p1 = OUTPUT_DIR / "01_macro_f1_gain_ablation.png"
plt.savefig(p1, dpi=300)
plt.close()
print(f"      Generated: {p1.name}")

# ------------------------------------------------------------------------------
# DIAGRAM 2: Recall MODERATE Breakthrough (Mitigating Class Imbalance)
# ------------------------------------------------------------------------------
plt.figure(figsize=(11, 5.5))
unweighted_rec_mod = df_results[df_results["Weighting Scheme"] == "Unweighted"]["Recall MODERATE"].values * 100
dual_weighted_rec_mod = df_results[df_results["Weighting Scheme"] == "Dual-Weighted"]["Recall MODERATE"].values * 100

plt.bar(x_idx - bar_width/2, unweighted_rec_mod, width=bar_width, label="Unweighted Baseline", color="#e74c3c", edgecolor="black", alpha=0.9)
plt.bar(x_idx + bar_width/2, dual_weighted_rec_mod, width=bar_width, label="Dual Class-Weighting", color="#2980b9", edgecolor="black", alpha=0.9)

for i in range(len(model_architectures)):
    diff = dual_weighted_rec_mod[i] - unweighted_rec_mod[i]
    plt.annotate(f"{unweighted_rec_mod[i]:.1f}%", (x_idx[i] - bar_width/2, unweighted_rec_mod[i] + 1.2), ha="center", fontsize=8, fontweight="bold")
    plt.annotate(f"{dual_weighted_rec_mod[i]:.1f}%\n(+{diff:.1f}%)", (x_idx[i] + bar_width/2, dual_weighted_rec_mod[i] + 1.2), ha="center", fontsize=8, fontweight="bold", color="#1b4f72")

plt.title("Recall MODERATE Breakthrough: Early Markdown Spoilage Detection", pad=15, fontweight="bold")
plt.xlabel("Machine Learning Architecture", fontweight="bold")
plt.ylabel("Recall MODERATE (%)", fontweight="bold")
plt.xticks(x_idx, model_architectures, fontweight="bold")
plt.ylim(0, 100)
plt.legend(loc="upper left")
plt.grid(axis="y", linestyle="--", alpha=0.5)

plt.tight_layout()
p2 = OUTPUT_DIR / "02_recall_moderate_jump_comparison.png"
plt.savefig(p2, dpi=300)
plt.close()
print(f"      Generated: {p2.name}")

# ------------------------------------------------------------------------------
# DIAGRAM 3: Recall HIGH Comparison (Food Waste Capture)
# ------------------------------------------------------------------------------
plt.figure(figsize=(11, 5.5))
unweighted_rec_high = df_results[df_results["Weighting Scheme"] == "Unweighted"]["Recall HIGH"].values * 100
dual_weighted_rec_high = df_results[df_results["Weighting Scheme"] == "Dual-Weighted"]["Recall HIGH"].values * 100

plt.bar(x_idx - bar_width/2, unweighted_rec_high, width=bar_width, label="Unweighted Baseline", color="#bdc3c7", edgecolor="black", alpha=0.9)
plt.bar(x_idx + bar_width/2, dual_weighted_rec_high, width=bar_width, label="Dual Class-Weighting", color="#e67e22", edgecolor="black", alpha=0.9)

for i in range(len(model_architectures)):
    plt.annotate(f"{unweighted_rec_high[i]:.1f}%", (x_idx[i] - bar_width/2, unweighted_rec_high[i] + 1.2), ha="center", fontsize=8, fontweight="bold")
    plt.annotate(f"{dual_weighted_rec_high[i]:.1f}%", (x_idx[i] + bar_width/2, dual_weighted_rec_high[i] + 1.2), ha="center", fontsize=8, fontweight="bold")

plt.title("Recall HIGH Comparison: Spoilage Interception Rate", pad=15, fontweight="bold")
plt.xlabel("Machine Learning Architecture", fontweight="bold")
plt.ylabel("Recall HIGH (%)", fontweight="bold")
plt.xticks(x_idx, model_architectures, fontweight="bold")
plt.ylim(0, 100)
plt.legend(loc="upper right")
plt.grid(axis="y", linestyle="--", alpha=0.5)

plt.tight_layout()
p3 = OUTPUT_DIR / "03_recall_high_preservation.png"
plt.savefig(p3, dpi=300)
plt.close()
print(f"      Generated: {p3.name}")

# ------------------------------------------------------------------------------
# DIAGRAM 4: Per-Class Recall Breakdown (All 10 Configurations)
# ------------------------------------------------------------------------------
plt.figure(figsize=(15, 6))
rec_cols = ["Recall HIGH", "Recall MODERATE", "Recall LOW"]
df_rec_melt = df_results.melt(id_vars=["Configuration"], value_vars=rec_cols, var_name="Risk Tier", value_name="Recall")
df_rec_melt["Risk Tier"] = df_rec_melt["Risk Tier"].str.replace("Recall ", "")

ax = sns.barplot(data=df_rec_melt, x="Risk Tier", y="Recall", hue="Configuration", palette="tab20")
plt.title("Per-Class Recall Balance: Unweighted vs Dual-Weighted Across Models", pad=15, fontweight="bold")
plt.xlabel("Risk Category", fontweight="bold")
plt.ylabel("Recall Score", fontweight="bold")
plt.ylim(0, 1.05)
plt.legend(bbox_to_anchor=(1.01, 1.0), loc="upper left", title="Configuration", fontsize=9)
plt.grid(axis="y", linestyle="--", alpha=0.5)

plt.tight_layout()
p4 = OUTPUT_DIR / "04_per_class_recall_ablation_grid.png"
plt.savefig(p4, dpi=300)
plt.close()
print(f"      Generated: {p4.name}")

# ------------------------------------------------------------------------------
# DIAGRAM 5: Confusion Matrices Grid: Unweighted (Top Row) vs Dual-Weighted (Bottom Row)
# ------------------------------------------------------------------------------
fig, axes = plt.subplots(2, 5, figsize=(23, 9))

for j, m_name in enumerate(model_architectures):
    # Top Row: Unweighted
    ax_un = axes[0, j]
    key_un = f"{m_name} (Unweighted)"
    cm_un = confusion_matrices[key_un]
    cm_un_norm = cm_un.astype('float') / cm_un.sum(axis=1)[:, np.newaxis]
    
    annot_un = np.empty_like(cm_un, dtype=object)
    for r in range(3):
        for c in range(3):
            annot_un[r, c] = f"{cm_un[r, c]:,}\n({cm_un_norm[r, c]*100:.1f}%)"
            
    f1_un = df_results.loc[df_results["Configuration"] == key_un, "Macro F1"].values[0]
    sns.heatmap(cm_un_norm, annot=annot_un, fmt="", cmap="Reds", cbar=False,
                xticklabels=CLASSES, yticklabels=CLASSES, ax=ax_un, annot_kws={"size": 8})
    ax_un.set_title(f"{m_name}\n[Unweighted] Macro F1: {f1_un:.4f}", fontweight="bold", fontsize=10)
    ax_un.set_xlabel("Predicted")
    ax_un.set_ylabel("True Label")

    # Bottom Row: Dual-Weighted
    ax_dw = axes[1, j]
    key_dw = f"{m_name} (Dual-Weighted)"
    cm_dw = confusion_matrices[key_dw]
    cm_dw_norm = cm_dw.astype('float') / cm_dw.sum(axis=1)[:, np.newaxis]
    
    annot_dw = np.empty_like(cm_dw, dtype=object)
    for r in range(3):
        for c in range(3):
            annot_dw[r, c] = f"{cm_dw[r, c]:,}\n({cm_dw_norm[r, c]*100:.1f}%)"
            
    f1_dw = df_results.loc[df_results["Configuration"] == key_dw, "Macro F1"].values[0]
    sns.heatmap(cm_dw_norm, annot=annot_dw, fmt="", cmap="Greens", cbar=False,
                xticklabels=CLASSES, yticklabels=CLASSES, ax=ax_dw, annot_kws={"size": 8})
    ax_dw.set_title(f"{m_name}\n[Dual-Weighted] Macro F1: {f1_dw:.4f}", fontweight="bold", fontsize=10)
    ax_dw.set_xlabel("Predicted")
    ax_dw.set_ylabel("True Label")

plt.suptitle("Confusion Matrix Shift: Unweighted (Top) vs Dual-Weighted (Bottom)",
             fontsize=15, fontweight="bold", y=0.99)
plt.tight_layout()
p5 = OUTPUT_DIR / "05_confusion_matrices_unweighted_vs_dual_weighted.png"
plt.savefig(p5, dpi=300)
plt.close()
print(f"      Generated: {p5.name}")

# ------------------------------------------------------------------------------
# DIAGRAM 6: Precision vs Recall Trajectory (Movement with Dual-Weighting)
# ------------------------------------------------------------------------------
fig, axes = plt.subplots(1, 2, figsize=(15, 6))

for m_name in model_architectures:
    row_un = df_results[df_results["Configuration"] == f"{m_name} (Unweighted)"].iloc[0]
    row_dw = df_results[df_results["Configuration"] == f"{m_name} (Dual-Weighted)"].iloc[0]
    
    # HIGH Risk
    axes[0].plot([row_un["Recall HIGH"], row_dw["Recall HIGH"]],
                 [row_un["Precision HIGH"], row_dw["Precision HIGH"]],
                 linestyle="--", marker="o", markersize=8, label=m_name, linewidth=2)
    axes[0].annotate(f"{m_name} [Unw]", (row_un["Recall HIGH"], row_un["Precision HIGH"] + 0.01), fontsize=8)
    axes[0].annotate(f"{m_name} [Dual]", (row_dw["Recall HIGH"], row_dw["Precision HIGH"] - 0.015), fontsize=8, fontweight="bold")

    # MODERATE Risk
    axes[1].plot([row_un["Recall MODERATE"], row_dw["Recall MODERATE"]],
                 [row_un["Precision MODERATE"], row_dw["Precision MODERATE"]],
                 linestyle="--", marker="s", markersize=8, label=m_name, linewidth=2)
    axes[1].annotate(f"{m_name} [Unw]", (row_un["Recall MODERATE"], row_un["Precision MODERATE"] + 0.01), fontsize=8)
    axes[1].annotate(f"{m_name} [Dual]", (row_dw["Recall MODERATE"], row_dw["Precision MODERATE"] - 0.015), fontsize=8, fontweight="bold")

axes[0].set_title("Movement Trajectory: HIGH Spoilage Risk", fontweight="bold")
axes[0].set_xlabel("Recall HIGH", fontweight="bold")
axes[0].set_ylabel("Precision HIGH", fontweight="bold")
axes[0].grid(True, linestyle="--", alpha=0.5)

axes[1].set_title("Movement Trajectory: MODERATE Spoilage Risk", fontweight="bold")
axes[1].set_xlabel("Recall MODERATE", fontweight="bold")
axes[1].set_ylabel("Precision MODERATE", fontweight="bold")
axes[1].grid(True, linestyle="--", alpha=0.5)
axes[1].legend(title="Model", bbox_to_anchor=(1.02, 1), loc="upper left")

plt.suptitle("Precision-Recall Trade-off Dynamics: Unweighted -> Dual-Weighted", fontsize=15, fontweight="bold", y=1.02)
plt.tight_layout()
p6 = OUTPUT_DIR / "06_precision_recall_tradeoff_ablation.png"
plt.savefig(p6, dpi=300)
plt.close()
print(f"      Generated: {p6.name}")

# ------------------------------------------------------------------------------
# DIAGRAM 7: Heatmap Matrix Ranking Across All Metrics
# ------------------------------------------------------------------------------
plt.figure(figsize=(11, 7))
heatmap_metrics = [
    "Accuracy", "Macro F1", "Weighted F1",
    "Recall HIGH", "Recall MODERATE", "Recall LOW",
    "Precision HIGH", "Precision MODERATE"
]
df_heat = df_results.set_index("Configuration")[heatmap_metrics]

sns.heatmap(df_heat, annot=True, fmt=".4f", cmap="YlGnBu", cbar=True, linewidths=0.7)
plt.title("Ablation Benchmark Matrix: Unweighted vs Dual-Weighted Configurations", pad=15, fontweight="bold")
plt.xlabel("Performance Metrics", fontweight="bold")
plt.ylabel("Model & Weighting Scheme", fontweight="bold")

plt.tight_layout()
p7 = OUTPUT_DIR / "07_ablation_ranking_heatmap.png"
plt.savefig(p7, dpi=300)
plt.close()
print(f"      Generated: {p7.name}")

# ------------------------------------------------------------------------------
# DIAGRAM 8: Summary Bar Chart of All Metrics
# ------------------------------------------------------------------------------
plt.figure(figsize=(15, 7))
melt_cols = ["Accuracy", "Macro F1", "Weighted F1", "Recall HIGH", "Recall MODERATE"]
df_melt_all = df_results.melt(id_vars=["Configuration"], value_vars=melt_cols, var_name="Metric", value_name="Score")

ax = sns.barplot(data=df_melt_all, x="Metric", y="Score", hue="Configuration", palette="tab20")
plt.title("Complete Ablation Benchmark Across Evaluation Metrics", pad=15, fontweight="bold")
plt.xlabel("Evaluation Metric", fontweight="bold")
plt.ylabel("Score", fontweight="bold")
plt.ylim(0, 1.05)
plt.legend(bbox_to_anchor=(1.01, 1.0), loc="upper left", title="Configuration", fontsize=9)
plt.grid(axis="y", linestyle="--", alpha=0.5)

plt.tight_layout()
p8 = OUTPUT_DIR / "08_overall_metrics_comparison_table_bar.png"
plt.savefig(p8, dpi=300)
plt.close()
print(f"      Generated: {p8.name}")

print("\n" + "=" * 80)
print(f"ALL ABLATION BENCHMARK DIAGRAMS SUCCESSFULLY GENERATED AT:")
print(f"{OUTPUT_DIR}")
print("=" * 80)
