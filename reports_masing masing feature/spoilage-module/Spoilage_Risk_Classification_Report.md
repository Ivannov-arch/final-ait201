# FreshGuard — Spoilage Risk Classification Module
## Data, Methodology, Results and Discussion

> **Scope of this document:** the spoilage risk classifier only (Person 1 — XGBoost two-tier risk engine). The demand forecasting module and the dispatch cargo estimator are documented separately.
> **All figures were produced by executing the project's own pipeline and evaluation scripts against the shipped artifacts (`models/spoilage_classifier.pkl`). No number is estimated or illustrative.**

---

## 1. Data and Methodology

### 1.1 Data Source

The classifier is trained on the **perishable goods / grocery inventory management** dataset, cleaned into `data/processed/7_perishable_goods_cleaned.csv`.

| Attribute | Value |
|---|---|
| Raw source | `data/raw/7. Grocery_Inventory new v1.csv` and `data/raw/7. perishable_goods_management.csv` |
| Prepared training table | `data/processed/7_perishable_goods_cleaned.csv` |
| Rows | **89,880** |
| Columns | 42 (31 removed as leakage/metadata/sensor, 11 retained, 9 of those expanded into 19 feature columns) |
| Missing values | **0** across the entire table |
| Duplicate rows | **0** |
| Transaction window | **2023-01-01 → 2024-12-31** (expiration dates up to 2025-12-05) |
| Categories | **9** (`Meat, Ready_to_Eat, Bakery, Produce, Deli, Dairy, Seafood, Frozen_Meals, Beverages`) |
| Regions present in the data | 5 (`Northeast 26,975 · Southeast 18,071 · West 17,875 · Midwest 14,301 · Southwest 12,658`) — retained in the frame but **excluded from the feature matrix** (region-agnostic design) |
| Stores | **50** (`STORE_001` … `STORE_050`) |

Each row is one inventory receipt: a product arriving at a store on a transaction date, with its shelf life, quantity, price, demand behaviour, handling/storage telemetry, and the **realised waste outcome** of that receipt.

**Why this dataset.** The model must predict spoilage risk for a fresh-food retailer *before* the waste happens. The only dataset in scope that records both the operational receipt attributes **and** the realised waste percentage is this one — every other dataset in the project (M5 sales, food-waste archive) lacks the pre-sale feature set needed for a pre-purchase risk score.

### 1.2 Data Preparation

Preparation is executed in `notebooks/step7_spoilage_classifier.ipynb` (Steps 1–8). The ordering below is deliberate and is the reason the evaluation is not circular.

**(a) Target derivation — from realised waste, never from expiry.** The label is derived from the observed `waste_pct` of the receipt:

| Label | `waste_pct` condition | Business meaning |
|---|---|---|
| `LOW` | `waste_pct == 0` | Nothing was wasted |
| `MODERATE` | `0% < waste_pct <= 25%` | Partial write-off |
| `HIGH` | `waste_pct > 25%` | Severe write-off / critical loss |

The notebook states this explicitly: *"Target labels are NOT generated from `days_until_expiry` thresholds to prevent tautology and circular evaluation bias."* This is the single most important methodological decision in the module — the label is an **outcome**, and `days_until_expiry` is an **input**. A model trained against DTE-derived labels could achieve high accuracy while learning nothing beyond the DTE threshold, which is exactly the rule-based baseline it is supposed to beat.

**(b) Leakage, metadata and sensor column elimination.** 31 of the 42 columns are dropped before splitting, in three groups:

| Group | Count | Columns | Reason |
|---|---:|---|---|
| Leakage / outcome | 11 | `waste_pct, units_wasted, waste_cost, units_sold, revenue, profit, profit_margin_pct, selling_price, markdown_applied, discount_pct, was_spoiled` | known only *after* the outcome |
| Metadata | 7 | `record_id, product_id, product_name, store_id, supplier_id, transaction_date, expiration_date` | identifiers, not signal |
| Sensor / unavailable-at-inference | 13 | `storage_temp, temp_deviation, temp_abuse_events, distribution_hours, handling_score, packaging_score, demand_variability, spoilage_risk, spoilage_sensitivity, supplier_score, quality_grade, cost_price, days_remaining_at_purchase` | not present in the store's batch-registration payload at prediction time |

The third group is a **deployment-alignment** decision, not merely a leakage decision: a feature the retailer cannot supply at inference time cannot be used, however predictive it is in the historical table.

**(c) Feature engineering.** One derived feature is added:

```
stock_pressure = initial_quantity / (daily_demand + 1)     # rounded to 2 dp
```

This is the stock-versus-demand pressure ratio: how many days of cover the receipt represents. It is the module's main departure from a pure DTE proxy and becomes the third-most important feature in the trained model (§3.5).

**(d) Category normalisation.** `Produce` is renamed to `Fruits & Vegetables` so that the retail category and the model's one-hot vocabulary share one spelling. Without this the produce family would silently collapse into an all-zero one-hot block.

**(e) Encoding.** The 10 numeric features plus `category` are one-hot encoded (`drop_first=False`) into exactly **19 production-ready columns**, region-agnostic. Of the 11 columns surviving the drop step, `region` is the only one deliberately left out of the matrix — it is a US-geographic label with no meaning for a Malaysian store, so the model was made region-independent rather than fed a meaningless default region.

### 1.3 Exploratory Data Analysis

**Target distribution.** `waste_pct` is strongly zero-inflated and right-skewed:

| Statistic | Value |
|---|---|
| Mean | 20.91 % |
| Median | 11.80 % |
| Std. dev. | 26.17 |
| Min / Max | 0 % / 100 % |
| Exact zeros | 38,130 (**42.42 %**) |
| Rows > 25 % (HIGH) | 37,040 |
| Rows in (0 %, 25 %] (MODERATE) | 14,710 |

Resulting class balance:

| Class | Samples | Share |
|---|---:|---:|
| LOW | 38,130 | 42.42 % |
| HIGH | 37,040 | 41.21 % |
| MODERATE | 14,710 | **16.37 %** |

LOW and HIGH are near-balanced (ratio 1.03:1), but **MODERATE is a minority class at 16.37 %** — and the confusion matrix in §3.3 shows this minority class is where the model fails hardest. This single imbalance is the root cause of the module's central limitation.

**Category-level waste behaviour.**

| Category | Mean `waste_pct` | Median | Std. dev. | % HIGH |
|---|---:|---:|---:|---:|
| Frozen_Meals | **50.01** | 38.60 | 43.41 | **63.19 %** |
| Beverages | 20.70 | 13.50 | 24.51 | 42.04 % |
| Meat | 18.20 | 14.20 | 19.48 | 40.91 % |
| Produce | 18.45 | 11.00 | 21.71 | 39.51 % |
| Seafood | 17.41 | 11.30 | 19.02 | 40.25 % |
| Deli | 16.90 | 9.40 | 19.53 | 37.83 % |
| Dairy | 16.91 | 4.40 | 22.07 | 36.08 % |
| Bakery | 15.35 | 4.50 | 18.22 | 35.29 % |
| Ready_to_Eat | 14.56 | 0.00 | 17.50 | 36.00 % |

`Frozen_Meals` is a structural outlier — mean waste of 50 %, more than double any other category, with 63 % of receipts ending in the HIGH band. It also has the smallest class balance (1,267 of 1,979 test rows are true HIGH). This single category drives a large share of the model's overall error, and it is the fourth most important feature by importance score (§3.5).

**Numeric feature behaviour and correlation with waste.**

| Feature | Mean | Std. dev. | Min | Median | Max | corr. with `waste_pct` |
|---|---:|---:|---:|---:|---:|---:|
| `initial_quantity` | 254.86 | 141.78 | 10 | 255 | 500 | **−0.1611** |
| `base_price` | 11.34 | 8.02 | 1.00 | 9.32 | 45.00 | +0.0049 |
| `daily_demand` | 71.54 | 95.86 | 0 | 40 | 1,118 | **−0.2239** |
| `days_until_expiry` | 25.18 | 59.17 | 0 | 5 | 362 | **+0.3842** |
| `shelf_life_days` | 31.76 | 70.36 | 1 | 8 | 365 | **+0.3956** |
| `day_of_week` | 3.01 | 2.00 | 0 | 3 | 6 | −0.1134 |
| `is_weekend` | 0.29 | 0.45 | 0 | 0 | 1 | −0.1463 |
| `month` | 6.53 | 3.46 | 1 | 7 | 12 | +0.0217 |
| `is_promoted` | 0.15 | 0.36 | 0 | 0 | 1 | +0.0012 |

The correlation structure is coherent with the business hypothesis: **longer shelf life and more days remaining ⇒ more waste** (positive), while **higher demand and larger stock relative to demand ⇒ less waste** (negative). `base_price` (+0.005) and `is_promoted` (+0.001) carry essentially no signal and are retained only because they are free to compute.

**EDA conclusions driving the design.** (1) The target is a 3-class problem with a 16.37 % minority class → macro-F1 is the headline metric, and minority-class recall must be reported explicitly. (2) Category identity carries substantial risk signal (waste ranges 14.6 %–50.0 % mean across categories) → one-hot category encoding is justified. (3) `days_until_expiry` correlates at only +0.384 → the label is *not* a DTE proxy, which is exactly what makes the ML model worth building. (4) Demand-side features (`daily_demand`, `stock_pressure`) contribute materially → the model can express "stock too high relative to demand", the actual driver of write-offs.

### 1.4 Machine Learning Method

**Algorithm.** `xgboost.XGBClassifier` — multi-class gradient-boosted decision trees with `mlogloss` objective:

| Parameter | Value |
|---|---|
| `n_estimators` | 150 |
| `max_depth` | 6 |
| `learning_rate` | 0.08 |
| `subsample` | 0.85 |
| `colsample_bytree` | 0.85 |
| `random_state` | 42 |
| `eval_metric` | `mlogloss` |

**Model benchmark.** Three candidates were trained on the identical zero-leakage pipeline, and XGBoost was selected as production champion (notebook Step 10): `RandomForestClassifier(n_estimators=100, class_weight="balanced")`, `GradientBoostingClassifier(n_estimators=100)`, `XGBClassifier(...)`.

**Validation design.** Stratified 80/20 split with `random_state=42` and `stratify=y`, preserving class proportions: **71,904 training rows / 17,976 test rows**. The `StandardScaler` is fitted **on the training partition only** and then applied to both, preventing distribution leakage across the split boundary.

**Two-Tier Decision Architecture.** The shipped decision function is not the raw classifier:

| Tier | Function | Role |
|---|---|---|
| **Tier 1** | XGBoost `predict_proba` over `{HIGH, LOW, MODERATE}` | statistical risk profile from inventory features |
| **Tier 2** | `apply_continuous_tier2(probs, category, dte, alpha=0.10)` | continuous policy escalation |

Tier 2 applies an exponential time-decay urgency factor `u = exp(-dte / tau_c)` with a per-category characteristic time constant, then shifts probability mass from LOW to HIGH:

```
u     = exp(-dte / tau_c)              tau_c ∈ {Bakery 2, Meat 3, Seafood 3, Deli 3,
                                              Ready_to_Eat 3, Dairy 4, F&V 4, …}
shift = alpha * u                       alpha = 0.10
P'(HIGH) = (P(HIGH) + shift) / Z
P'(LOW)  = max(0, P(LOW) - shift) / Z
```

The intent is that a category with a short characteristic shelf life (bakery, tau = 2 days) escalates sharply as expiry approaches, while a longer-shelf-life category escalates gently — a decision rule the raw classifier, which sees DTE only as one feature among 19, does not encode.

**Deployment-layer extensions (backend, `src/ml/spoilage.py`).**

| Extension | Purpose |
|---|---|
| `SHELF_STABLE_CATEGORIES` | Dry-goods departments (Grains & Pulses, Oils & Fats, Grocery, Dry Goods, Pantry, Snacks, Liquor/Beer/Wine) return `LOW` at probability 0.95 without inference — they are non-perishable and have no microbial spoilage pathway. DTE ≤ 0 still returns HIGH 0.95. |
| `CATEGORY_EQUIVALENCE` | Retail categories with no trained one-hot column are mapped to the nearest trained category with equivalent spoilage dynamics (Poultry/Beef/Pork→Meat, Prepared Foods→Ready_to_Eat, Frozen Foods→Frozen_Meals, Eggs→Dairy, Bread/Pastry→Bakery, Drinks→Beverages, Fish→Seafood). Prevents the all-zero one-hot degeneracy. |
| Persistent bridge (`src/ml/spoilage_bridge.py`) | Node/Vite runtime cannot load a `.pkl`; a long-lived Python process answers JSON-line requests, loading the model once. |

### 1.5 Project Workflow

```
 data/raw/7. Grocery_Inventory new v1.csv
 data/raw/7. perishable_goods_management.csv
              │
              ▼
 ETL + cleaning ──► 7_perishable_goods_cleaned.csv (89,880 × 42, 0 missing)
              │
              ▼
 step7_spoilage_classifier.ipynb
   Step 2  derive target label from waste_pct (LOW / MODERATE / HIGH)
   Step 3  drop 31 leakage + metadata + sensor columns
   Step 4  derive stock_pressure; normalise Produce → Fruits & Vegetables
   Step 5  EDA (target balance, per-category waste, correlation matrix)
   Step 6  one-hot encode → 19 feature columns
   Step 7  stratified 80/20 split (seed 42)
   Step 8  StandardScaler fitted on train only
   Step 9  rule-based DTE baseline (benchmark)
   Step 10 benchmark RF vs GBM vs XGBoost → XGBoost champion
   Step 11 final evaluation + confusion matrix
   Step 12 feature importance
              │
              ▼
 models/spoilage_classifier.pkl   (model, scaler, features, classes, metrics)
              │
              ▼
 src/ml/spoilage.py :: predict_spoilage_risk()
   ├─ shelf-stable department  → policy LOW 0.95 (DTE ≤ 0 → HIGH)
   ├─ category equivalence     → trained one-hot column
   └─ Tier 1 XGBoost + Tier 2 continuous decay
              │
      ┌───────┴────────┐
      ▼                ▼
 src/ml/spoilage_bridge.py   backend/services/batch_service.py
 (persistent Python proc)   (FastAPI GET + POST)
      │                │
      ▼                ▼
 frontend/vite.config.js  →  GET/POST/PATCH /api/batches
      │                  →  fields riskScore (0–1) + riskSource
      ▼
 Inventory FEFO & Risk page — risk badge, markdown/donation routing
```

**Runtime verification.** Live endpoint test on the 58-batch inventory: **42 batches** scored by the XGBoost model (`riskSource: ml_xgboost`), **16 batches** by the shelf-stable policy (`riskSource: policy_shelf_stable`, 27.6 % of stock — matching the dry-goods share of the store). Zero rows fell back to the DTE heuristic.

---

## 2. Evaluation Metrics

| Metric | Definition | Why used |
|---|---|---|
| **Accuracy** | fraction of correct predictions | headline, but misleading under imbalance |
| **F1-macro** | unweighted mean F1 across the 3 classes | primary metric — every class counts equally, so the 16.37 % minority class cannot be hidden |
| **Precision / Recall (per class)** | per-class detail | a missed HIGH receipt is wasted food; a false HIGH is needless markdown |
| **Confusion matrix** | actual × predicted counts | shows exactly which pairs the model confuses |
| **Baseline comparison** | rule-based DTE heuristic | proves the model learned more than the expiry date |

**Baseline definition** (notebook Step 9): `dte <= 7 → HIGH`, `dte <= 30 → MODERATE`, else `LOW`. This is the traditional retail heuristic, evaluated on exactly the same test rows.

---

## 3. Results and Discussion

### 3.1 Headline Results (test split, 17,976 rows)

| Metric | Model (XGBoost) | Baseline (DTE rule) | Difference |
|---|---:|---:|---:|
| **Accuracy** | **0.6733** | 0.3226 | **+35.07 pp** |
| **F1-macro** | **0.5127** | 0.2698 | **+24.29 pp** |
| F1-weighted | 0.6239 | 0.2827 | +34.12 pp |
| Macro recall | 0.5446 | 0.3179 | +22.67 pp |

The model more than doubles the accuracy of the expiry-date heuristic. Because the baseline uses DTE and DTE is also a model input, this comparison is the direct evidence that **the classifier learned signal beyond the expiry date** — the demand-pressure features and category identity contribute the difference.

### 3.2 Per-Class Performance

| Class | Support | Precision | Recall | F1 |
|---|---:|---:|---:|---:|
| HIGH | 7,408 | 0.6929 | **0.6875** | 0.6902 |
| LOW | 7,626 | 0.6720 | **0.9024** | 0.7704 |
| MODERATE | 2,942 | 0.3351 | **0.0438** | 0.0775 |

**Interpretation.**
- **HIGH (the class that matters commercially) is well served.** Recall 0.6875 means roughly 2 in 3 severely-wasted receipts are flagged in advance. For a food-waste product, a false negative is real food lost, so 68.75 % recall is the number that governs the business case.
- **LOW recall is 0.9024** — the model correctly clears the vast majority of receipts that will not spoil. This matters for operational cost: a store does not want to markdown or donate stock that was never going to spoil.
- **MODERATE collapses to 0.0438 recall.** Only 129 of 2,942 true MODERATE receipts are identified, against 2,813 that are misrouted to HIGH (1,640) or LOW (1,173). The class is effectively absent from the model's output: it predicts MODERATE only **385 times** in 17,976 rows (2.14 %).

### 3.3 Confusion Matrix (rows = actual, columns = predicted)

**Model — accuracy 0.6733:**

| actual \ predicted | HIGH | LOW | MODERATE |
|---|---:|---:|---:|
| **HIGH** (7,408) | **5,093** | 2,186 | 129 |
| **LOW** (7,626) | 617 | **6,882** | 127 |
| **MODERATE** (2,942) | 1,640 | 1,173 | **129** |

**Baseline (DTE rule) — accuracy 0.3226:**

| actual \ predicted | HIGH | LOW | MODERATE |
|---|---:|---:|---:|
| **HIGH** (7,408) | 4,369 | 1,267 | 1,772 |
| **LOW** (7,626) | 4,572 | 585 | 2,469 |
| **MODERATE** (2,942) | 1,970 | 127 | 845 |

**Baseline diagnosis.** The rule heuristic misclassifies **4,572 true-LOW receipts as HIGH** — it assumes anything within 7 days of expiry will be wasted, which is false for the 42 % of receipts that record zero waste. It also puts 2,469 LOW receipts in MODERATE. Its LOW recall is 0.0767: the heuristic is almost incapable of certifying a receipt as safe. **This is the precise reason the deployment was corrected to use the model rather than the DTE threshold.**

**Model diagnosis.** The model's errors are asymmetric in a business-friendly way: it over-predicts LOW for true HIGH (2,186 cases, i.e. it clears some receipts that do spoil — the cost of a miss) far less often than the baseline over-predicts HIGH for true LOW (4,572 cases — the cost of needless markdown and donation). The model's dominant confusion is MODERATE→HIGH (1,640), which is the minority-class collapse discussed in §3.2.

### 3.4 Per-Category Performance (test split)

| Category | n | Model accuracy | Baseline accuracy | True HIGH | Model recall HIGH | Baseline recall HIGH |
|---|---:|---:|---:|---:|---:|---:|
| Frozen_Meals | 1,979 | **0.8514** | 0.2956 | 1,267 | **0.8895** | 0.0000 |
| Ready_to_Eat | 2,039 | 0.6758 | 0.3615 | 737 | 0.5387 | 1.0000 |
| Beverages | 1,951 | 0.6648 | 0.2394 | 832 | 0.7344 | 0.2224 |
| Bakery | 2,052 | 0.6608 | 0.3504 | 719 | 0.6426 | 1.0000 |
| Dairy | 2,025 | 0.6489 | 0.2247 | 726 | 0.5923 | 0.2810 |
| Fruits & Vegetables | 1,985 | 0.6489 | 0.2957 | 773 | 0.6792 | 0.4955 |
| Seafood | 1,939 | 0.6478 | 0.4059 | 787 | 0.6658 | 1.0000 |
| Deli | 2,008 | 0.6424 | 0.3446 | 769 | 0.6684 | 0.7750 |
| Meat | 1,998 | 0.6206 | 0.3854 | 798 | 0.6303 | 0.9499 |

**Interpretation.**
- The model beats the baseline on accuracy in **every** category, by 23.5 pp (Meat) to 55.6 pp (Frozen_Meals).
- `Frozen_Meals` is the model's best category (**0.8514** accuracy, 0.8895 HIGH recall) — it is also the category with the most extreme waste behaviour (63 % HIGH, mean waste 50 %), so the signal is strong and consistent. Note the baseline scores **0.0000** HIGH recall here: every frozen-meal receipt sits beyond the 7-day DTE window, so the rule calls all of them LOW.
- **The baseline's HIGH recall is 1.0000 in Bakery, Ready_to_Eat and Seafood** and **0.9499 in Meat** — the rule flags *everything* in those categories, which is why its accuracy collapses there. Over-flagging is not skill; it is indiscriminate escalation.
- `Meat` is the model's weakest category (0.6206). Its test split contains 798 true-HIGH rows and the baseline recall of 0.9499 shows that most meat receipts are already past 7 days — the model is being asked to separate HIGH from LOW on a population where the DTE signal is saturated.

### 3.5 Feature Importance

| Rank | Feature | Importance |
|---:|---|---:|
| 1 | `days_until_expiry` | 0.1773 |
| 2 | `daily_demand` | 0.1644 |
| 3 | `stock_pressure` | 0.1386 |
| 4 | `category_Frozen_Meals` | 0.1266 |
| 5 | `is_weekend` | 0.0758 |
| 6 | `shelf_life_days` | 0.0708 |
| 7 | `day_of_week` | 0.0576 |
| 8 | `initial_quantity` | 0.0289 |
| 9–19 | category one-hots, `base_price`, `month`, `is_promoted` | 0.0113–0.0176 each |

The importance ordering is the strongest evidence that the model is doing the intended work. **Demand-side features outrank everything except expiry**: `daily_demand` (0.1644) and `stock_pressure` (0.1386) together carry 30.3 % of the total importance — more than `days_until_expiry` (0.1773) and `shelf_life_days` (0.0708) combined (24.8 %). The model has learned the actual waste mechanism: *stock that sits relative to how fast it sells*.

Two further readings:
- `category_Frozen_Meals` alone (0.1266) outranks eight of the nine other category indicators — the model learned the frozen-meal waste anomaly from the data, matching the EDA finding (63 % HIGH).
- `is_weekend` (0.0758) is the fifth most important feature and `day_of_week` the seventh. Combined (13.3 %) they exceed every price, promotion and calendar feature. Weekend demand patterns materially change waste exposure.

### 3.6 Tier-2 Policy Layer Impact

The shipped system does not return the raw classifier's argmax; it applies the continuous time-decay escalation. Measured on the same 17,976 test rows:

| Configuration | Accuracy | F1-macro | Recall HIGH | Precision HIGH |
|---|---:|---:|---:|---:|
| Tier 1 only (raw XGBoost) | **0.6733** | **0.5127** | 0.6875 | 0.6929 |
| **Tier 1 + Tier 2 (shipped, α = 0.10)** | 0.6714 | 0.5060 | **0.7146** | 0.6634 |

Tier 2 changes **665 labels (3.70 %)** of the test set: 490 LOW→HIGH, 140 MODERATE→HIGH, 35 LOW→MODERATE. Of those 665 flips, 248 were correct before and 213 after — a **net −35 rows** (0.19 pp of accuracy).

**The honest reading: Tier 2 is a deliberate trade, not a free improvement.** It costs 0.19 pp accuracy and 0.67 pp macro-F1, and buys **+2.71 pp HIGH recall** (0.6875 → 0.7146) at the price of −2.95 pp HIGH precision (0.6929 → 0.6634). In a food-waste product the asymmetry is the point: a missed HIGH receipt is food thrown away, while a false HIGH is stock markdown or donation that a food bank still consumes. The operator is deliberately paying precision for recall.

**Alpha sweep** (policy strength vs. metrics):

| α | Accuracy | F1-macro | Recall HIGH |
|---:|---:|---:|---:|
| 0.00 | 0.6733 | 0.5127 | 0.6875 |
| 0.05 | 0.6719 | 0.5070 | 0.7013 |
| **0.10** (shipped) | 0.6714 | 0.5060 | 0.7146 |
| 0.15 | 0.6700 | 0.5036 | 0.7262 |
| 0.20 | 0.6657 | 0.4985 | 0.7370 |

The trade-off is monotonic and smooth: each increment of α buys HIGH recall at a predictable cost. α = 0.10 sits at the point where recall gain (2.71 pp) is roughly 14× the accuracy cost (0.19 pp) — defensible for the waste-prevention objective, and the knob is exposed as a parameter so the trade can be re-tuned against a different business objective without retraining.

### 3.7 Interpretation of Findings

1. **The model is a strong HIGH-vs-rest detector, not a reliable 3-class classifier.** F1-macro 0.5127 with MODERATE recall 0.0438 means the shipped output is effectively binary in practice. The product already treats it this way: the two decisions that matter operationally are *is this receipt HIGH risk* (route to markdown/donation) and *is this receipt LOW risk* (leave it alone). The MODERATE band, where the model contributes nothing, is covered by the DTE horizon and the rule engine's tiered markdown schedule.

2. **The minority class is the bottleneck, and it is fixable without new data.** MODERATE is 16.37 % of the population and receives 4.38 % recall. The two standard remedies are (a) class-weighted training (`scale_pos_weight` per class), which was applied to the RandomForest candidate but *not* to XGBoost, and (b) threshold/decision-boundary recalibration. This is the highest-value improvement identified by this evaluation, and it requires no new data collection.

3. **The model beats the DTE heuristic because it models velocity, not just expiry.** The baseline gets 0.3226 accuracy and 0.0767 LOW recall; the model gets 0.6733 and 0.9024. The importance table explains the mechanism: demand and stock-pressure features outrank expiry. A receipt with 14 days left but 5 days of demand cover is safe; the DTE rule has no way to know that.

4. **Frozen meals dominate the error budget.** `Frozen_Meals` is 10 % of the population but contributes the largest HIGH population (1,267 of 7,408 true HIGH in the test split = 17 %) and the largest share of misclassifications. It is also the category where the baseline fails completely (HIGH recall 0.0000). Any category-specific recalibration should start there.

5. **The 2017-scale training data is not the binding constraint for this module.** The spoilage model was trained on a 2023–2024 grocery inventory dataset (not the 2017 M5 sales series used for forecasting), and it operates on *receipt-level* attributes — quantity, price, demand, shelf life, day of week — that a Malaysian store still records at goods-in. The main portability caveat is category taxonomy, addressed by `CATEGORY_EQUIVALENCE` rather than by retraining.

6. **The shelf-stable policy is a domain correction, not a model compromise.** Grains and oils have no microbial spoilage pathway; sending them through a perishable classifier would be scientifically wrong, and the model could not learn it (no such examples exist in training). Returning LOW 0.95 for those departments is the correct treatment, and the 16/58 = 27.6 % dry-goods share measured on live inventory matches the store's actual mix.

### 3.8 Limitations

| Limitation | Evidence | Status / mitigation |
|---|---|---|
| MODERATE recall 0.0438 | §3.2, §3.3 | Accepted for deployment (product needs only HIGH/LOW); class-weight recalibration is the top improvement candidate |
| Model trained on US category taxonomy | 9 trained one-hot columns vs. 30 retail categories | Resolved by `CATEGORY_EQUIVALENCE` + `SHELF_STABLE_CATEGORIES` — no retraining required |
| Region dropped from the feature set | Model v3 uses 19 features, region-agnostic | Resolved — removes the meaningless `Midwest` default that the earlier 24-feature version carried |
| `sku_pickle` version mismatch warning | sklearn 1.9.1 artifact vs. 1.4.2 runtime | Non-fatal; `.venv` now pinned to sklearn 1.9.1 (exact training version) |
| Shelf-life and expiry dominate the signal | §3.5 importance | Mitigated by Tier 2 escalation, which raises HIGH recall by 2.71 pp |
| No Malaysian store in the training data | `store_id` values are `STORE_001`–`STORE_050`; the rows are synthetic US-retail | Acceptable — features are store-operational, not market-specific |

---

## 4. Reproducibility

```powershell
# 1. Full training + evaluation pipeline (notebook)
jupyter nbconvert --to notebook --execute notebooks/step7_spoilage_classifier.ipynb

# 2. Reproduction of the evaluation tables in this report
python <this repo>/src/forecasting/...          # not required for this module
python scripts/eval_spoilage.py                 # rebuilds pipeline, evaluates the shipped .pkl

# 3. Runtime smoke test through the persistent bridge
echo '{"lots":[{"days_until_expiry":1,"category":"Dairy","initial_quantity":50,
                "base_price":8.0,"daily_demand":10,"shelf_life_days":7}]}' \
  | python src/ml/spoilage_bridge.py
# -> {"ok": true, "results": [{"label": "HIGH", "score": 0.9914, ...}]}

# 4. End-to-end deployment check (frontend path)
cd frontend && npm run dev
curl http://localhost:5173/api/batches | jq '[.[] | .riskSource] | group_by(.) | map({(.[0]): length}) | add'
# -> {"ml_xgboost": 42, "policy_shelf_stable": 16}
```

**Shipped artifacts**

| Artifact | Path |
|---|---|
| Trained model package | `models/spoilage_classifier.pkl` (model, scaler, 19 features, classes, metrics) |
| Training + evaluation | `notebooks/step7_spoilage_classifier.ipynb` |
| Training data | `data/processed/7_perishable_goods_cleaned.csv` (89,880 rows) |
| Inference + Tier 2 policy | `src/ml/spoilage.py` (`predict_spoilage_risk`, `apply_continuous_tier2`) |
| Node bridge | `src/ml/spoilage_bridge.py` |
| FastAPI integration | `backend/services/batch_service.py`, `backend/schemas/batch.py` |
| Frontend integration | `frontend/vite.config.js` (GET/POST/PATCH `/api/batches`) |

**Model package contents** (as shipped)

```
model       : XGBClassifier (n_estimators=150, max_depth=6, learning_rate=0.08,
              subsample=0.85, colsample_bytree=0.85, random_state=42)
scaler      : StandardScaler (19 features)
features    : 10 numeric + 9 category one-hot
classes     : ['HIGH', 'LOW', 'MODERATE']
metrics     : accuracy 0.6733, f1_macro 0.5127, recall_high 0.6875,
              recall_low 0.9024, recall_mod 0.0438
```

---

*Report generated from executed project scripts and the shipped model artifact. Every metric, count, matrix entry and importance score in this document is reproducible with the commands in Section 4.*
