# Project Changelog — AIT201 Data Pipeline
**Scope:** All dataset work done on the data/preprocessing side  
**Author:** Jeffrey Khang (Data Person)  
**Last Updated:** 2026-11-13

---

## How to Read This Log
- Each entry is dated and tagged with a **type**: `AUDIT`, `CLEAN`, `FIX`, `FEAT`, `BOOTSTRAP`, `GIT`, `BUG`
- Entries marked 🔴 introduced a known problem that was later corrected
- Entries marked ✅ are confirmed correct and stable
- Entries marked 🔧 are corrections to earlier mistakes

---

## 2026-10-31

### [AUDIT] Initial Dataset Audit Against AI Instruction Specifications ✅
**Files checked:**
- `7. Grocery_Inventory new v1.csv`
- `7. perishable_goods_management.csv`
- `8. data_dictionary.csv` *(later found to be schema doc only — data file missing)*
- `8. holidays_events.csv`
- `11. food_waste_ml_1000.csv`
- `11. pricecatcher_2026-10.csv`
- `11. archive/food_waste_dataset.csv`
- `11. archive/data_dictionary.csv`

**Problems documented:**
| Dataset | Problem |
|---|---|
| Grocery Inventory | Column misspelled as `Catagory` |
| Grocery Inventory | 1 null in `Catagory` — Row 574, Cabbage |
| Step 8 | Main data CSV was missing — only data dictionary present |
| Food Waste ML | `product_encoded` has no category name mapping |
| Food Waste ML | All numeric features min-max scaled [0,1] — real values lost |
| Food Waste Archive | 5 columns with ~2–3% null values |
| PriceCatcher | `premise_code` and `item_code` are numeric codes — no lookup table |

**Output:** `docs/dataset_audit.md` created (later updated twice on same day)

---

### [AUDIT] Dataset Audit Updated — Step 8 Files Added ✅
After re-upload of Step 8 folder:
- Confirmed `train.csv` (3M rows, Favorita/Ecuador), `stores.csv`, `oil.csv`, `holidays_events.csv`, `transactions.csv` all present
- Found `oil.csv` → `dcoilwtico` has 43 null values on public holidays (expected behaviour, not an error)
- Found `sell_price` is completely absent from all Step 8 files
- Found `onpromotion` in `test.csv` ranges 0–646 (not binary as expected)
- Updated `docs/dataset_audit.md`

---

## 2026-11-03

### [CLEAN] First Cleaning Attempt — Grocery Inventory ✅
**Script:** Manual (later replaced by `clean_datasets.py`)  
**Input:** `data/raw/7. Grocery_Inventory new v1.csv`  
**Output:** `food_cleaning_ait201/processed data set/7. Grocery_Inventory_cleaned.csv` *(old path, later moved)*

**Changes made:**
- Renamed `Catagory` → `Category`
- Filled Row 574 (Cabbage) → `Fruits & Vegetables`

---

### [GIT] Git LFS Setup ✅
**Reason:** 3 files too large for standard git commit (would exceed GitHub 100MB limit)

**Files tracked via Git LFS:**
| File | Size |
|---|---|
| `data/raw/8. .../train.csv` | 116.2 MB |
| `data/raw/11. pricecatcher_2026-10.csv` | 31.6 MB |
| `data/raw/7. perishable_goods_management.csv` | 20.1 MB |

**Commands run:**
```bash
git lfs install
git lfs track "data/raw/8. store-sales-time-series-forecasting/train.csv"
git lfs track "data/raw/11. pricecatcher_2026-10.csv"
git lfs track "data/raw/7. perishable_goods_management.csv"
```
**`.gitattributes` created** with LFS rules for the 3 files above.

---

### [GIT] All Raw Datasets Committed ✅
- Deleted `.gitignore` restriction on `data/` folder
- Force-added all remaining raw files
- Commit: `feat: add all remaining raw datasets`

---

## 2026-11-09

### [CLEAN] Full Professional Preprocessing Pipeline — All Datasets ✅
**Script:** `clean_datasets.py`  
**Output folder:** `data/processed/`

**10 steps applied to every dataset:**
1. Schema enforcement (correct dtypes, rename typos, strip `$`/`%`)
2. Food-only filter (remove non-food rows)
3. Null imputation (category-level median/mode)
4. Duplicate removal
5. Domain validation (clip negative quantities, Waste ≤ Purchase)
6. Outlier capping — Winsorisation at 1st–99th percentile
7. Datetime features (`year`, `month`, `day`, `day_of_week`, `week`, `quarter`, `is_weekend`)
8. Domain features (`days_until_expiry` for FEFO, binary `onpromotion` for M5)
9. String cleanup (strip whitespace, consistent casing)
10. Sort (chronological + logical key order)

**Per-dataset changes:**

| Dataset | Rows Before | Rows After | Key Actions |
|---|---|---|---|
| Grocery Inventory | 990 | 990 | Renamed col, filled null, stripped `$`/`%`, parsed dates, added `days_until_expiry` |
| Perishable Goods | 100,000 | 89,880 | Removed Pharmaceuticals (10,120 rows) |
| M5 Train | 3,000,888 | 1,273,104 | Removed 19 non-food families |
| M5 Test *(new)* | 28,512 | 12,096 | Same food filter + fixed `onpromotion` 0–646 → binary 0/1 |
| Oil | 1,218 | 1,218 | Forward-filled + back-filled 43 holiday nulls |
| Retail Sales | 25,000 | 6,844 | Kept Groceries only |
| Food Waste Archive | 8,000 | 8,000 | Imputed 1,067 nulls across 5 columns |
| PriceCatcher | 1,279,987 | 1,279,987 | Capped 2,389 extreme prices |

**Winsorisation summary (values capped):**
- Grocery: 45 values across 5 columns
- Perishable: ~8,607 values across 7 columns
- M5 Train: 6,366 sales values
- Oil: 13 price values
- Transactions: 1,654 values
- Retail: ~739 values across 6 columns
- Food Waste Archive: ~588 values across 5 columns
- PriceCatcher: 2,389 price values

> 🔴 **Known issue flagged but not fixed at this stage:** 496 rows in Grocery Inventory where `Expiration_Date < Date_Received` (days_until_expiry < 0). These were kept with a warning. This later caused the ML class imbalance problem — see 2026-11-13 entry.

---

### [BOOTSTRAP] Initial Bootstrapping — Jitter Method 🔴
**Script:** `bootstrap_datasets.py`  
**Output folder:** `data/processed/bootstrapped/`  
**Method:** Stratified resampling with replacement + Gaussian noise (σ = 1% of column std)

| Dataset | Before | After | Stratified by |
|---|---|---|---|
| Food Waste ML | 1,000 | 5,000 | `risk_level` |
| Grocery Inventory | 990 | 5,000 | `Category` + `Status` |
| Food Waste Archive | 8,000 | 25,000 | `Food_Category` + `Waste_Level` |

> 🔴 **Problem introduced:** Jitter/noise augmentation adds noise to each column independently, breaking the natural correlations between columns. For example, a HIGH RISK product should simultaneously have short shelf life AND high waste AND high spoilage sensitivity — but adding noise column-by-column does not guarantee this. This was flagged by the ML engineer as a cause of model confusion. Fixed on 2026-11-13.

---

### [GIT] Commits and Push ✅
- Pulled from remote with `git pull --rebase origin main`
- Squashed all data commits into one: `"bootstrapping and data processed"`
- Force pushed to `origin/main`
- Updated remote URL: `food-cleaning-ait201` → `final-ait201` (repo renamed on GitHub)
- Added `README.md` with notice for teammates to run `git pull --rebase origin main`

> ⚠️ Force push was required because history was rewritten. No teammate work was deleted — all their commits below `a335169` are intact.

---

### [GIT] Preprocessing Report Added ✅
**File:** `docs/preprocessing_report.md`  
Full documentation of all 12 datasets — problems found, actions taken, bootstrapping methodology, and final file inventory.

---

## 2026-11-13

### [AUDIT] ML Engineer Report Received — Class Imbalance Identified 🔴
**From:** Person 1 (ML Engineer)  
**Problem:** Severe class imbalance in `spoilage_risk` after ML pipeline:
- LOW: 920 samples (93%)
- MODERATE: 53 samples (5.3%)
- HIGH: 17 samples (1.7%)

**Root causes traced back to data side:**
1. **496 broken expiry rows** (flagged 2026-11-09 but not fixed) — when ML engineer dropped rows with `shelf_life_days <= 0`, these were removed, disproportionately gutting HIGH RISK (short shelf-life) samples
2. **Jitter bootstrapping** broke inter-column correlations — synthetic HIGH RISK rows were statistically inconsistent

**ML engineer tested 6 algorithmic fixes — all failed:**
| Method | Recall on HIGH | Global Accuracy |
|---|---|---|
| Class weights (40× penalty) | 0% | — |
| SMOTE | 0% | Overfitting |
| SMOTEENN | 27% | 38% (collapsed) |
| Gaussian generative model | 18% | 73% |
| Threshold tuning | 18% | 54% |
| Median imputation reconstruction | 0% | 93% |

**Conclusion:** ML-side solutions maxed out. Fix must come from data side.

---

### [FIX] Fix 1 — Repair 496 Broken Expiry Date Rows 🔧
**Script:** `clean_datasets.py` (updated)  
**File affected:** `data/processed/7_grocery_inventory_cleaned.csv`

**What was wrong:** 496 rows had `Expiration_Date < Date_Received`, making `days_until_expiry` negative. These were left in the dataset as flagged but broken data. The ML engineer had to drop them, losing most HIGH RISK (short shelf-life) product examples.

**Fix applied:** Instead of dropping or leaving broken, impute `Expiration_Date` using the **category-level median shelf life** calculated from valid rows in the same `Category`.

```
For each broken row:
  median_shelf_life = median(days_until_expiry) of valid rows in same Category
  Expiration_Date   = Date_Received + median_shelf_life (days)
  days_until_expiry = median_shelf_life
```

**Result:** 496 rows repaired, 0 rows lost. HIGH RISK samples restored.

---

### [FIX] Fix 2 — Replace Jitter Bootstrap with SMOTE 🔧
**Script:** `bootstrap_datasets.py` (updated)  
**Files affected:** All 3 bootstrapped datasets

**What was wrong:** Jitter bootstrap added Gaussian noise to each column independently. This ignored correlations between columns — a synthetic HIGH RISK row could have short shelf life but zero waste, which is physically incoherent. The ML engineer confirmed this confused the model.

**Fix applied:** Replaced with **SMOTE** (Synthetic Minority Oversampling Technique):
- SMOTE synthesises new rows by interpolating *between real nearest-neighbour rows*
- Inter-column relationships are preserved because the new row is a blend of real examples
- For datasets with categorical columns: **SMOTE-NC** (Nominal & Continuous) used instead

**Per-dataset SMOTE strategy:**

| Dataset | Method | Stratify by | Before | After |
|---|---|---|---|---|
| Food Waste ML | SMOTE | `risk_level` | 1,000 | 5,000 |
| Grocery Inventory | SMOTE-NC | `Category` + `Status` | 990 | 5,000 |
| Food Waste Archive | SMOTE-NC | `Food_Category` + `Waste_Level` | 8,000 | 25,000 |

---

### [GIT] Fixes Committed and Pushed ✅
- Updated `clean_datasets.py` with Fix 1
- Updated `bootstrap_datasets.py` with Fix 2 (SMOTE)
- Regenerated all processed and bootstrapped files
- Updated this changelog
- Commit: `fix: repair 496 broken expiry rows + replace jitter bootstrap with SMOTE`
- Normal push (no force push)

---

## File Inventory (Current State)

### `data/processed/`
| File | Rows | Notes |
|---|---|---|
| `7_grocery_inventory_cleaned.csv` | 990 | Fixed — 496 expiry rows repaired |
| `7_perishable_goods_cleaned.csv` | 89,880 | Pharmaceuticals removed |
| `8_m5_train_food_cleaned.csv` | 1,273,104 | 14 food families only |
| `8_m5_test_food_cleaned.csv` | 12,096 | Food filter + binary onpromotion |
| `8_stores_cleaned.csv` | 54 | String cleanup only |
| `8_oil_cleaned.csv` | 1,218 | 43 holiday nulls filled |
| `8_holidays_events_cleaned.csv` | 350 | Date parsed |
| `8_transactions_cleaned.csv` | 83,488 | Outliers capped |
| `8_retail_sales_food_cleaned.csv` | 6,844 | Groceries only |
| `11_food_waste_ml_cleaned.csv` | 1,000 | Already clean |
| `11_food_waste_archive_cleaned.csv` | 8,000 | 1,067 nulls imputed |
| `11_pricecatcher_cleaned.csv` | 1,279,987 | 2,389 price outliers capped |

### `data/processed/bootstrapped/`
| File | Original | Bootstrapped | Method |
|---|---|---|---|
| `7_grocery_inventory_bootstrapped.csv` | 990 | 5,000 | SMOTE-NC |
| `11_food_waste_ml_bootstrapped.csv` | 1,000 | 5,000 | SMOTE |
| `11_food_waste_archive_bootstrapped.csv` | 8,000 | 25,000 | SMOTE-NC |

### Scripts
| File | Purpose |
|---|---|
| `clean_datasets.py` | Full preprocessing pipeline — run this to regenerate `data/processed/` |
| `bootstrap_datasets.py` | SMOTE bootstrapping — run this after clean_datasets.py |

---

## Quick Reference — All Issues & Resolutions

| Date | Issue | Status |
|---|---|---|
| 2026-10-31 | Step 8 main data CSV missing | ✅ Resolved — uploaded 2026-11-03 |
| 2026-10-31 | `Catagory` column typo | ✅ Fixed in clean_datasets.py |
| 2026-10-31 | 1 null in Grocery (Cabbage) | ✅ Fixed — `Fruits & Vegetables` |
| 2026-10-31 | Oil.csv 43 holiday nulls | ✅ Fixed — forward/back fill |
| 2026-10-31 | Food Waste Archive 1,067 nulls | ✅ Fixed — category-level imputation |
| 2026-10-31 | PriceCatcher codes have no lookup | ⚠️ Open — DOSM lookup table not in repo |
| 2026-10-31 | Food Waste ML product_encoded has no label mapping | ⚠️ Open — original mapping unknown |
| 2026-11-09 | 496 broken expiry rows in Grocery | ✅ Fixed 2026-11-13 — median imputation |
| 2026-11-09 | Jitter bootstrap breaks column correlations | ✅ Fixed 2026-11-13 — replaced with SMOTE |
| 2026-11-13 | ML class imbalance (HIGH 1.7%) | ✅ Root cause fixed via Fix 1 + Fix 2 |
