# Data Preprocessing & Bootstrapping Report
**Project:** AIT201 Group Project — Food Waste Management System  
**Scope:** All datasets in `data/raw/` → `data/processed/` and `data/processed/bootstrapped/`  
**Scripts:** [`clean_datasets.py`](../clean_datasets.py) · [`bootstrap_datasets.py`](../bootstrap_datasets.py)

---

## Overview

This report documents every preprocessing and bootstrapping decision made on the raw datasets. No raw files were modified. All outputs live in `data/processed/` and `data/processed/bootstrapped/`.

### Processing Steps Applied (All Datasets)

| Step | Description |
|---|---|
| 1. Schema enforcement | Correct dtypes, rename typo columns, strip `$`/`%` symbols from strings |
| 2. Food-only filter | Remove all non-food product rows/categories |
| 3. Null imputation | Category-level median (numeric), mode (categorical) |
| 4. Duplicate removal | Drop exact duplicate rows |
| 5. Domain validation | Clip negative quantities/sales to 0; cap Waste ≤ Purchase |
| 6. Outlier capping | Winsorisation at 1st–99th percentile on key numeric columns |
| 7. Datetime features | Parse date strings → datetime; add `year`, `month`, `day`, `day_of_week`, `week`, `quarter`, `is_weekend` |
| 8. Domain features | `days_until_expiry` for FEFO logic; binary `onpromotion` for M5 |
| 9. String cleanup | Strip whitespace, standardise casing |
| 10. Sort | Chronological + logical key ordering |

---

## Dataset-by-Dataset Report

---

### 1. `7_grocery_inventory_cleaned.csv`
**Source:** `data/raw/7. Grocery_Inventory new v1.csv`  
**Rows:** 990 → 990 (no rows removed)

#### Problems Found
| Column | Problem |
|---|---|
| `Catagory` | Column name misspelled — missing letter 'e' |
| `Catagory` | 1 null value at row 574 — product **Cabbage** had no category assigned |
| `Unit_Price` | Stored as string with `$` prefix e.g. `"$4.60"` — not numeric |
| `percentage` | Stored as string with `%` suffix and inconsistent formatting e.g. `"022%"`, `"-161%"` — not numeric |
| `Date_Received`, `Last_Order_Date`, `Expiration_Date` | Plain strings — not parsed as dates |
| Numeric columns | Extreme outliers at the tails |
| `Expiration_Date` vs `Date_Received` | **496 rows** where expiry date is earlier than received date — product received after already expired |

#### Actions Taken
1. Renamed column `Catagory` → `Category`
2. Filled row 574 (Cabbage) → `Fruits & Vegetables`
3. Stripped `$` from `Unit_Price`, converted to `float`
4. Stripped `%` from `percentage`, divided by 100 to convert to decimal ratio. Negatives kept — they represent inventory shrinkage/returns which are valid business events
5. Parsed all three date columns as `datetime`
6. Added `days_until_expiry` column (`Expiration_Date − Date_Received`) for FEFO logic
7. Winsorised 5 numeric columns — capped 45 extreme values
8. Stripped whitespace from all string columns
9. Sorted by `Category` then `Expiration_Date`
10. The 496 rows with negative `days_until_expiry` were **flagged but not dropped** — they are identifiable via that column and should be reviewed by the team

---

### 2. `7_perishable_goods_cleaned.csv`
**Source:** `data/raw/7. perishable_goods_management.csv`  
**Rows:** 100,000 → 89,880 (10,120 removed)

#### Problems Found
| Column | Problem |
|---|---|
| `category` | Contains `Pharmaceuticals` — not a food product |
| `transaction_date`, `expiration_date` | Plain strings — not parsed as dates |
| Financial/quantity columns | Extreme outliers at the tails |

#### Not a Problem (Kept as-is)
- **Negative `storage_temp`** — Frozen Meals average −20°C, Seafood and Meat near 0°C. Physically correct cold storage temperatures
- **Negative `profit`** — 25,179 rows show a loss. Legitimate business outcome from markdown events and spoilage write-offs

#### Actions Taken
1. Removed all 10,120 `Pharmaceuticals` rows → 89,880 rows remain
2. Parsed `transaction_date` and `expiration_date` as `datetime`
3. Winsorised 7 financial/quantity columns — capped ~8,607 extreme values
4. Stripped whitespace from all string columns
5. Sorted by `category` then `transaction_date`

---

### 3. `8_m5_train_food_cleaned.csv`
**Source:** `data/raw/8. store-sales-time-series-forecasting/train.csv`  
**Rows:** 3,000,888 → 1,273,104 (1,727,784 removed — 58% reduction)

#### Problems Found
| Column | Problem |
|---|---|
| `family` | 19 non-food product families present (Automotive, Beauty, Books, Hardware, Cleaning, Home Appliances, Ladieswear, Lingerie, etc.) |
| `onpromotion` | Should be binary 0/1 but contained values > 1 |
| `date` | Plain string — not parsed as date |
| `sales` | Long-tail distribution with extreme high values |

#### Actions Taken
1. Filtered to **14 food families only**: BEVERAGES, BREAD/BAKERY, DAIRY, DELI, EGGS, FROZEN FOODS, GROCERY I, GROCERY II, LIQUOR/WINE/BEER, MEATS, POULTRY, PREPARED FOODS, PRODUCE, SEAFOOD
2. Clipped `onpromotion` to binary 0/1
3. Parsed `date` as `datetime` and added datetime features
4. Winsorised `sales` at 99.5th percentile — capped 6,366 extreme values
5. Removed duplicate `(date, store_nbr, family)` combinations
6. Sorted by `date`, `store_nbr`, `family`

---

### 4. `8_m5_test_food_cleaned.csv` *(new — was not processed in previous run)*
**Source:** `data/raw/8. store-sales-time-series-forecasting/test.csv`  
**Rows:** 28,512 → 12,096 (16,416 removed)

#### Problems Found
| Column | Problem |
|---|---|
| `family` | Same 19 non-food families as train.csv |
| `onpromotion` | **Major issue:** values ranged from 0 to 646. The raw Favorita test set encodes `onpromotion` as the *count of items on promotion*, not a binary flag — completely different encoding from train.csv |
| `date` | Plain string — not parsed as date |

#### Actions Taken
1. Applied same food filter as train.csv → 12,096 rows remain
2. Normalised `onpromotion` to binary: `0 if value == 0, else 1`
3. Parsed `date` as `datetime` and added datetime features
4. Sorted by `date`, `store_nbr`, `family`

---

### 5. `8_stores_cleaned.csv`
**Source:** `data/raw/8. store-sales-time-series-forecasting/stores.csv`  
**Rows:** 54 → 54 (no rows removed)

#### Problems Found
- City and state name strings had inconsistent casing

#### Actions Taken
1. Applied Title Case to all string columns
2. Stripped whitespace
3. Removed duplicates (none found)

---

### 6. `8_oil_cleaned.csv`
**Source:** `data/raw/8. store-sales-time-series-forecasting/oil.csv`  
**Rows:** 1,218 → 1,218 (no rows removed)

#### Problems Found
| Column | Problem |
|---|---|
| `dcoilwtico` | 43 null values — oil price missing on public holidays when commodity markets are closed |
| `dcoilwtico` | 13 extreme price values at the tails |
| `date` | Plain string — not parsed as date |

#### Actions Taken
1. Sorted by `date`
2. Forward-filled (`ffill`) holiday nulls — carries the last known price forward
3. Back-filled (`bfill`) the very first row (no prior value to carry forward)
4. Parsed `date` as `datetime` and added datetime features
5. Winsorised `dcoilwtico` — capped 13 extreme values

---

### 7. `8_holidays_events_cleaned.csv`
**Source:** `data/raw/8. store-sales-time-series-forecasting/holidays_events.csv`  
**Rows:** 350 → 350 (no rows removed)

#### Problems Found
- `date` stored as plain string
- Minor whitespace in string fields

#### Actions Taken
1. Parsed `date` as `datetime`
2. Stripped whitespace from all string columns
3. Sorted by `date`

> **Note:** All holidays are Ecuador-based (Favorita dataset). Do not use directly as a Malaysian holiday calendar — for pattern/shape calibration only.

---

### 8. `8_transactions_cleaned.csv`
**Source:** `data/raw/8. store-sales-time-series-forecasting/transactions.csv`  
**Rows:** 83,488 → 83,488 (no rows removed)

#### Problems Found
| Column | Problem |
|---|---|
| `date` | Plain string — not parsed as date |
| `transactions` | 1,654 extreme high values at the tail |

#### Actions Taken
1. Parsed `date` as `datetime` and added datetime features
2. Clipped negative `transactions` to 0 (precautionary — none found)
3. Winsorised `transactions` — capped 1,654 extreme values
4. Sorted by `date`, `store_nbr`

---

### 9. `8_retail_sales_food_cleaned.csv`
**Source:** `data/raw/retail_sales_forecast_dataset.csv`  
**Rows:** 25,000 → 6,844 (18,156 removed)

#### Problems Found
| Column | Problem |
|---|---|
| `Product_Category` | 6 non-food categories: Sports, Clothing, Electronics, Home & Kitchen, Toys, Beauty |
| `Date` | Plain string — not parsed as date |
| Numeric columns | Extreme outliers at the tails |

#### Actions Taken
1. Filtered to `Groceries` category only → 6,844 rows remain
2. Remaining subcategories: **Snacks, Dairy, Fresh Produce, Beverages**
3. Parsed `Date` as `datetime`
4. Clipped `Units_Sold` and `Returns` to minimum 0 (precautionary)
5. Winsorised 6 numeric columns — capped ~739 extreme values
6. Stripped whitespace from all string columns
7. Sorted by `Date`, `Store_ID`, `Product_ID`

---

### 10. `11_food_waste_ml_cleaned.csv`
**Source:** `data/raw/11. food_waste_ml_1000.csv`  
**Rows:** 1,000 → 1,000 (no rows removed)

#### Problems Found
- `risk_level` and `recommended_action` had inconsistent string casing

#### Known Limitations (Not Fixable from This File)
- `product_encoded` is an integer (0–7) with no accompanying category name mapping
- All numeric features (`quantity`, `price`, `expiry_days`, `temperature`) are min-max scaled to [0,1] — original real-world values unrecoverable
- Only 1,000 rows — very small for a robust classifier → **bootstrapped**

#### Actions Taken
1. Standardised string columns to UPPERCASE
2. Validated all normalised columns within [0,1] bounds — all passed
3. Removed duplicates (none found)

---

### 11. `11_food_waste_archive_cleaned.csv`
**Source:** `data/raw/11. archive/food_waste_dataset.csv`  
**Rows:** 8,000 → 8,000 (no rows removed)

#### Problems Found — Null Values
| Column | Null Count | % |
|---|---|---|
| `Shelf_Life_Days` | 235 | 2.9% |
| `Donation_Made` | 233 | 2.9% |
| `Daily_Demand` | 210 | 2.6% |
| `Weather` | 203 | 2.5% |
| `Storage_Temperature` | 186 | 2.3% |

#### Other Problems
| Column | Problem |
|---|---|
| `Date` | Plain string — not parsed as date |
| Numeric columns | Extreme outliers at the tails |

#### Not a Problem (Kept as-is)
- **Negative `Storage_Temperature`** — Meat (−4°C), Dairy, Vegetables near 0°C. Physically valid cold storage readings

#### Actions Taken
1. Imputed `Shelf_Life_Days` → median per `Food_Category`
2. Imputed `Storage_Temperature` → median per `Food_Category`
3. Imputed `Daily_Demand` → median per `Food_Category` + `Business_Type` combination
4. Imputed `Weather` → mode per `Business_Type` (most common weather per business type)
5. Imputed `Donation_Made` → mode per `Business_Type`
6. Validated `Waste_Quantity ≤ Purchase_Quantity` — no violations found
7. Validated `Units_Sold + Waste_Quantity ≤ Purchase_Quantity` — no violations found
8. Parsed `Date` as `datetime` and added datetime features
9. Winsorised 5 numeric columns — capped ~588 extreme values
10. Stripped whitespace from all string columns
11. Sorted by `Date`, `Business_Type`, `Food_Category`

---

### 12. `11_pricecatcher_cleaned.csv`
**Source:** `data/raw/11. pricecatcher_2026-10.csv`  
**Rows:** 1,279,987 → 1,279,987 (no rows removed)

#### Problems Found
| Column | Problem |
|---|---|
| `date` | Plain string — not parsed as date |
| `price` | 2,389 extreme price values at the tails (likely data entry errors) |

#### Known Limitation (Not Fixable)
- `premise_code` and `item_code` are numeric codes — no lookup table is included to decode them into readable item names or food categories. The DOSM companion lookup tables are needed for this.

#### Actions Taken
1. Validated no prices ≤ 0 — none found
2. Parsed `date` as `datetime` and added datetime features
3. Winsorised `price` at 0.1th–99.9th percentile — capped 2,389 extreme values (range after capping: RM 0.90–RM 83.30)
4. Removed duplicate `(date, premise_code, item_code)` entries — none found
5. Sorted by `date`, `premise_code`, `item_code`

---

## Bootstrapping Report

Bootstrapping was applied to the **three smallest datasets** where limited sample size would hurt model generalisation. All bootstrapped files are in `data/processed/bootstrapped/`.

### Method: Stratified Bootstrap with Gaussian Jitter

```
1. Group original data by the main class column(s)
2. Within each group, resample WITH replacement to generate synthetic rows
3. Add small Gaussian noise (σ = 1% of each column's std) to numeric
   columns in synthetic rows — prevents the model memorising exact duplicates
4. Clip bounds after jitter (e.g. quantities stay ≥ 0, normalised values stay in [0,1])
5. Snap integer-natured columns back to integers
6. Concatenate: original rows + synthetic rows
```

> **Important for your team:** Always **train on bootstrapped data, validate and test on original cleaned data only**. If you evaluate on bootstrapped rows that are near-copies of training rows, your metrics will be artificially inflated.

---

### Bootstrap 1: `11_food_waste_ml_bootstrapped.csv`
**Stratified by:** `risk_level`  
**Target:** 1,000 → 5,000 rows (5×)

**Why bootstrapped:**  
Only 160 MEDIUM-risk rows in the original dataset. With 3 classes (HIGH/MEDIUM/LOW), a classifier trained on this will almost never predict MEDIUM correctly due to severe underrepresentation. 5,000 rows gives enough MEDIUM examples to learn from.

| risk_level | Before | After |
|---|---|---|
| LOW | 535 | 2,675 |
| HIGH | 305 | 1,525 |
| MEDIUM | 160 | 800 |

---

### Bootstrap 2: `7_grocery_inventory_bootstrapped.csv`
**Stratified by:** `Category` + `Status`  
**Target:** 990 → 5,000 rows (~5×)

**Why bootstrapped:**  
Only 990 rows total with 7 categories × 3 statuses = 21 possible subgroups, some with fewer than 25 rows. FEFO logic and stock prediction models need enough examples per category to learn shelf-life and reorder patterns reliably.

| Category | Before | After |
|---|---|---|
| Fruits & Vegetables | 332 | 1,676 |
| Dairy | 180 | 909 |
| Grains & Pulses | 162 | 819 |
| Seafood | 90 | 455 |
| Oils & Fats | 77 | 389 |
| Beverages | 75 | 379 |
| Bakery | 74 | 373 |

---

### Bootstrap 3: `11_food_waste_archive_bootstrapped.csv`
**Stratified by:** `Food_Category` + `Waste_Level`  
**Target:** 8,000 → 25,000 rows (~3×)

**Why bootstrapped:**  
HIGH waste events are the most important to predict for donation matching and clearing house decisions, yet they represent only 15.9% of the data (1,272 rows). Stratified bootstrapping scales all classes proportionally so the classifier isn't biased toward predicting LOW waste.

| Waste_Level | Before | After |
|---|---|---|
| Low | 4,331 | 13,534 |
| Medium | 2,397 | 7,491 |
| High | 1,272 | 3,975 |

---

## Final File Inventory

### `data/processed/`
| File | Rows | Size |
|---|---|---|
| `7_grocery_inventory_cleaned.csv` | 990 | ~0.1 MB |
| `7_perishable_goods_cleaned.csv` | 89,880 | ~18.0 MB |
| `8_m5_train_food_cleaned.csv` | 1,273,104 | ~72.1 MB |
| `8_m5_test_food_cleaned.csv` | 12,096 | ~0.6 MB |
| `8_stores_cleaned.csv` | 54 | <0.1 MB |
| `8_oil_cleaned.csv` | 1,218 | <0.1 MB |
| `8_holidays_events_cleaned.csv` | 350 | <0.1 MB |
| `8_transactions_cleaned.csv` | 83,488 | ~3.1 MB |
| `8_retail_sales_food_cleaned.csv` | 6,844 | ~1.3 MB |
| `11_food_waste_ml_cleaned.csv` | 1,000 | ~0.1 MB |
| `11_food_waste_archive_cleaned.csv` | 8,000 | ~0.9 MB |
| `11_pricecatcher_cleaned.csv` | 1,279,987 | ~57.3 MB |

### `data/processed/bootstrapped/`
| File | Original Rows | Bootstrapped Rows | Size |
|---|---|---|---|
| `7_grocery_inventory_bootstrapped.csv` | 990 | 5,000 | ~1.1 MB |
| `11_food_waste_ml_bootstrapped.csv` | 1,000 | 5,000 | ~0.5 MB |
| `11_food_waste_archive_bootstrapped.csv` | 8,000 | 25,000 | ~2.4 MB |

### Not Processed (Documentation / Competition Files)
| File | Reason |
|---|---|
| `8. .../sample_submission.csv` | Kaggle competition submission template — not data |
| `8. data_dictionary.csv` | Schema reference document — not data |
| `8. retail_sales_forecast_notebook.ipynb` | Analysis notebook — not data |
| `11. archive/data_dictionary.csv` | Schema reference document — not data |
| `11. archive/README.md` | Documentation — not data |
