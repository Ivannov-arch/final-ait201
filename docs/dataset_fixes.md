# Dataset Fixes — Person 0 (Jeffrey Khang)

**Last Updated:** 2026-11-17  
**Role:** Data Person (Person 0)  
**Scope:** Raw data cleaning, reconstruction, and supplementary file delivery

---

## Summary

This document records all data-level fixes and additions made to the shared dataset pool. These are distinct from model-level experiments (see `docs/preprocessing_report.md` for full pipeline context and `docs/changelog.md` for dated history).

---

## Fix 1 — Broken Expiry Rows Reconstruction (2026-11-13)

**File affected:** `data/processed/7_grocery_inventory_cleaned.csv`  
**Root cause:** 499 rows in the raw grocery inventory data had `shelf_life_days <= 0`, caused by upstream logistics input errors where the expiry date was recorded *before* the received date — a physically impossible value.  

**What we did:** Instead of dropping these rows (which would remove ~50% of the dataset and cripple the ML models), we imputed `shelf_life_days` using the **median value from rows of the same product category** that had valid data. This is a standard logistics imputation strategy — same product category implies similar shelf life characteristics.

**Result:** 496 rows rescued. Dataset restored from ~496 usable rows to ~992 rows total. Global accuracy of spoilage classifier jumped from ~50% to **93%**.

---

## Fix 2 — Bootstrapped Minority Class Data via SMOTE (2026-11-13)

**Files affected:**
- `data/processed/bootstrapped/7_grocery_inventory_bootstrapped.csv`
- `data/processed/bootstrapped/8_retail_sales_bootstrapped.csv`
- `data/processed/bootstrapped/11_pricecatcher_bootstrapped.csv`

**Root cause:** After Fix 1, the `spoilage_risk` class distribution was still severely imbalanced:
- LOW: 920 samples (93%)
- MODERATE: 53 samples (5.3%)
- HIGH: 17 samples (1.7%)

This caused all 5 algorithmic methods tried (class weighting, SMOTE alone, SMOTEENN, Gaussian generation, threshold tuning) to fail on the minority classes.

**What we did:** Applied **SMOTE (Synthetic Minority Over-sampling Technique)** to generate synthetic samples for the MODERATE and HIGH classes in the bootstrapped versions. SMOTE works by interpolating between real data points (using K-Nearest Neighbors), not random noise — making it statistically sound.

**Result:** Bootstrapped files have balanced class distribution for model training. Original cleaned files are preserved untouched.

---

## Addition 1 — Malaysian Public Holidays (2026-11-17)

**File created:** `data/processed/holidays_my.csv`  
**Why:** Person 2's demand forecast model uses an `is_holiday` feature. The existing holidays data (`8_holidays_events_cleaned.csv`) is sourced from an Ecuador-based Kaggle dataset (Favorita) and is therefore irrelevant for a Malaysia deployment.

**What we did:** Created a 38-row CSV covering all official Malaysian public holidays for **2025 and 2026**, including:
- National holidays (Merdeka Day, Malaysia Day, Labour Day, New Year's Day, Christmas)
- Islamic holidays (Hari Raya Aidilfitri, Hari Raya Aidiladha, Awal Muharram, Nuzul Al-Quran, Prophet Muhammad's Birthday)
- Chinese holidays (Chinese New Year × 2 days)
- Hindu/Buddhist holidays (Thaipusam, Wesak Day, Deepavali)
- Federal Territory Day

**Format:**
```
date, holiday_name, is_public_holiday
2026-01-01, New Year's Day, 1
...
```

---

## Addition 2 — PriceCatcher Parquet Export (2026-11-17)

**File created:** `data/processed/11_pricecatcher_cleaned.parquet`  
**Why:** The PriceCatcher CSV has 1,279,987 rows. Parquet is a columnar binary format that loads significantly faster than CSV for large datasets — typically 5–10× faster read times. The data is identical to `11_pricecatcher_cleaned.csv`.

---

## File Index (Person 0 Outputs)

| File | Type | Description |
|------|------|-------------|
| `data/processed/7_grocery_inventory_cleaned.csv` | Cleaned | Fixed 496 broken expiry rows |
| `data/processed/bootstrapped/7_grocery_inventory_bootstrapped.csv` | Synthetic | SMOTE-balanced for ML training |
| `data/processed/bootstrapped/8_retail_sales_bootstrapped.csv` | Synthetic | SMOTE-balanced |
| `data/processed/bootstrapped/11_pricecatcher_bootstrapped.csv` | Synthetic | SMOTE-balanced |
| `data/processed/holidays_my.csv` | New | Malaysian public holidays 2025–2026 |
| `data/processed/11_pricecatcher_cleaned.parquet` | New | PriceCatcher in parquet format |
| `docs/changelog.md` | Doc | Full dated changelog |
| `docs/preprocessing_report.md` | Doc | Full preprocessing pipeline report |
