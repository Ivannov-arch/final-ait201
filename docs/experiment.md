# 📊 Spoilage Risk Classification Model — Experiment & Evaluation Report

This report summarizes the model development process, class imbalance mitigation experiments, data reconstruction techniques, and final architecture decisions for production integration.

---

## 1. Initial Model Benchmark (Grocery Inventory Baseline)

On the initial cleaned dataset (retaining **491 rows** after dropping corrupted rows with `shelf_life_days <= 0`), baseline models were evaluated to predict spoilage risk tiers (`HIGH`, `MODERATE`, `LOW`). Due to severe natural class imbalance (85.7% dominated by `LOW`), initial results demonstrated:
* **Model 0 (Dummy / Majority Baseline):** Achieved **86%** accuracy but failed completely on critical classes (Recall for `HIGH` and `MODERATE` was **0%**).
* **Model 1 (Random Forest + SMOTE):** Achieved **81%** accuracy, but minority class recall remained **0%**.
* **Model 2 (XGBoost + SMOTE):** Achieved **79%** accuracy with marginal sensitivity for `MODERATE` (Recall **18%**).

---

## 2. Imbalance Mitigation Experiments & Rationale

To address majority class bias, a structured sequence of experiments was conducted:

1. **Experiment 1: Custom Class Weights (Without SMOTE)**
   * *Rationale:* Penalize minority class misclassifications mathematically via loss weighting.
   * *Result:* Ineffective on severely sparse minority data (Recall remained **0%**).
2. **Experiment 2: SMOTEENN (SMOTE + Edited Nearest Neighbors)**
   * *Rationale:* Combine minority oversampling with decision-boundary noise cleaning.
   * *Result:* `MODERATE` recall improved to **27%**, but overall accuracy collapsed to **38%** (too unstable for production).
3. **Experiment 3: Decision Threshold Tuning**
   * *Rationale:* Calibrate probability cutoffs to be more sensitive to high-risk indications.
   * *Result:* Optimal compromise on initial data with **54%** accuracy and **18%** `MODERATE` recall.
4. **Experiment 4: Generative Probability Modeling (Gaussian & Multivariate Normal)**
   * *Rationale:* Test whether continuous parametric distributions better guide decision boundaries than KNN interpolation (SMOTE).
   * *Result:* Accuracy stabilized in the **73%–76%** range with **18%** `MODERATE` recall.
5. **Experiment 5: Dataset Reconstruction via Category Median**
   * *Rationale:* Recover 496 corrupted records by imputing valid shelf-life medians from similar product categories, restoring the dataset to **990 valid rows**.
   * *Result:* Increased training stability and data integrity without artificial synthesis.

---

## 3. The Modern Two-Tier Production Architecture (Perishable Goods Pipeline)

### Paradigm Shift: Ground Truth Target from `waste_pct`
In the modern architecture, the system shifted from circular DTE-based labeling to true operational loss modeling:
* **Dataset:** `data/processed/7_perishable_goods_cleaned.csv` (89,880 rows, food-only).
* **Target:** Actual historical waste percentage (`waste_pct`):
  * `LOW`: 0% waste
  * `MODERATE`: 0% < waste <= 25%
  * `HIGH`: waste > 25%
* **Feature Set:** 19 store-compatible pre-sale features (stock pressure, base price, daily demand, category — 9 OHE columns). US region features removed for global store compatibility. All post-sale leakage columns strictly dropped.

### Two-Tier System Decomposition

| Tier | Component | Role | Mechanism |
|---|---|---|---|
| **Tier 1** | **ML Classifier (XGBoost Champion)** | Baseline Risk Profiling | Gradient boosted trees predict baseline waste risk probability from 19 pre-sale inventory features ($P_{\text{ML}}$). |
| **Tier 2** | **Continuous Policy Engine** | Dynamic Time-Decay Escalation | Modulates probabilities via Bayesian time-decay: $P'(\text{HIGH}) = \frac{P(\text{HIGH}) + \alpha e^{-\text{DTE}/\tau_c}}{Z}$. |

### Multi-Model Benchmark Comparison (Perishable Goods Cleaned)

| Model Architecture | Accuracy | F1-Macro | Recall `HIGH` | Training Speed | Status |
|---|:---:|:---:|:---:|:---:|---|
| **XGBoost (Champion)** | **67.3%** | **0.513** | **68.75%** | **1.88s** | 🏆 **Production Model** (19 features, region-agnostic, highest accuracy) |
| **Random Forest** | 63.9% | 0.569 | 58.5% | 2.05s | Baseline Reference |
| **Gradient Boosting (GBM)** | 66.8% | 0.484 | 71.5% | 53.8s | High Recall but slow training |
| **AdaBoost** | 59.1% | 0.426 | 59.5% | 8.02s | Suboptimal on multi-class imbalance |
| **LightGBM** | 61.9% | 0.596 | 45.1% | 1.01s | High F1-macro but weak on critical HIGH recall |

### Empirical Validation Results (17,976 Natural Test Samples)

| Evaluation Metric | Tier 1 (Pure XGBoost ML) | Tier 1 + Tier 2 (Continuous Engine, $\alpha=0.10$) | Net Operational Impact |
|---|:---:|:---:|---|
| **Overall Accuracy** | **67.3%** | **67.1%** | Maintained high multi-class accuracy (+3.4% above Random Forest). |
| **F1-Macro** | **0.510** | **0.508** | Sharp focus on critical hazard vs safe inventory. |
| **Recall `HIGH` (Critical Waste)** | **69.1%** | **71.3%** | 🟢 **Captures >70% of all hazardous waste items.** |
| **Recall `LOW` (Safe Stock)** | **90.3%** | **88.6%** | Exceptional safe-stock precision (0.692) & retention. |
| **Binary Accuracy (Safe vs At-Risk)** | **76.8%** | **76.8%** | Solidly exceeds the 70% industrial benchmark. |

---

## 4. Production Inference Integration (`src/ml/spoilage.py`)

The inference function `predict_spoilage_risk(lot, apply_tier2=True)` is deployed for production usage across the system:

```python
from src.ml.spoilage import predict_spoilage_risk, sort_by_fefo

# Example input lot
lot = {
    'initial_quantity': 120,
    'base_price': 15.0,
    'daily_demand': 8.0,
    'days_until_expiry': 1,
    'shelf_life_days': 5,
    'category': 'Bakery'
}

result = predict_spoilage_risk(lot)
# Output:
# {
#     "label": "HIGH",
#     "score": 0.8375,
#     "raw_label": "HIGH",
#     "tier2_applied": True,
#     "urgency_factor": 0.6065,
#     "probabilities": {"HIGH": 0.8375, "MODERATE": 0.1617, "LOW": 0.0007}
# }
```
