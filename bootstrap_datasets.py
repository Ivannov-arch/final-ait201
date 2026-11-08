"""
Bootstrapping pipeline for small/imbalanced datasets.

Strategy: Stratified bootstrapping with jitter
  - Resample WITH replacement, stratified by the main class column
    so original class proportions are preserved.
  - Add small Gaussian noise (sigma=1% of column std) to numeric
    columns in the synthetic rows so the model doesn't memorise
    exact duplicates. All bounds are enforced after jitter.
  - Original rows are always kept — bootstrap rows are appended.

Targets:
  11_food_waste_ml_cleaned   :  1,000 ->  5,000 rows  (stratify: risk_level)
  7_grocery_inventory_cleaned:    990 ->  5,000 rows  (stratify: Category + Status)
  11_food_waste_archive_cleaned: 8,000 -> 25,000 rows  (stratify: Food_Category + Waste_Level)
"""

import pandas as pd
import numpy as np
import os

PROC = 'data/processed/'
BOOT = 'data/processed/bootstrapped/'
os.makedirs(BOOT, exist_ok=True)

RNG = np.random.default_rng(seed=42)   # reproducible


def jitter(df, numeric_cols, sigma_factor=0.01, clip_bounds=None):
    """Add tiny Gaussian noise to numeric columns in a copy of df."""
    df = df.copy()
    for col in numeric_cols:
        if col not in df.columns:
            continue
        sigma = df[col].std() * sigma_factor
        if sigma == 0:
            continue
        noise = RNG.normal(0, sigma, size=len(df))
        df[col] = df[col] + noise
        if clip_bounds and col in clip_bounds:
            lo, hi = clip_bounds[col]
            df[col] = df[col].clip(lo, hi)
    return df


def stratified_bootstrap(df, strat_cols, target_n, numeric_cols,
                          clip_bounds=None, sigma=0.01):
    """
    Bootstrap df up to target_n rows using stratified resampling.
    Original rows are kept; only the top-up rows are jittered.
    """
    n_needed = target_n - len(df)
    if n_needed <= 0:
        print(f'  Already at or above target ({len(df)} rows). Skipping.')
        return df

    # Compute per-stratum sample counts proportional to stratum size
    groups = df.groupby(strat_cols, observed=True)
    fracs  = groups.size() / len(df)
    counts = (fracs * n_needed).round().astype(int)
    # Adjust rounding error so total == n_needed exactly
    diff = n_needed - counts.sum()
    if diff != 0:
        largest = counts.idxmax()
        counts[largest] += diff

    parts = [df]  # always keep originals
    for key, count in counts.items():
        key = key if isinstance(key, tuple) else (key,)
        mask = pd.Series([True] * len(df))
        for col, val in zip(strat_cols, key):
            mask &= df[col] == val
        stratum = df[mask]
        if len(stratum) == 0 or count <= 0:
            continue
        sampled = stratum.sample(n=int(count), replace=True,
                                 random_state=42)
        sampled = jitter(sampled, numeric_cols, sigma, clip_bounds)
        parts.append(sampled)

    result = pd.concat(parts, ignore_index=True)
    return result


# ═════════════════════════════════════════════════════════════════════════════
# 1. FOOD WASTE ML  — 1,000 -> 5,000 rows
#    Stratify by: risk_level (LOW 535, HIGH 305, MEDIUM 160)
#    Numeric cols are already normalised [0,1] — clip after jitter
# ═════════════════════════════════════════════════════════════════════════════
print('\n=== 1. Food Waste ML (1,000 -> 5,000) ===')
df = pd.read_csv(PROC + '11_food_waste_ml_cleaned.csv')
print(f'  Before: {len(df)} rows')
print(f'  risk_level before: {df["risk_level"].value_counts().to_dict()}')

num_cols = ['quantity', 'price', 'expiry_days', 'temperature', 'predicted_demand']
clip_b   = {c: (0.0, 1.0) for c in ['quantity','price','expiry_days','temperature']}

df_boot = stratified_bootstrap(
    df,
    strat_cols  = ['risk_level'],
    target_n    = 5000,
    numeric_cols= num_cols,
    clip_bounds = clip_b,
    sigma       = 0.01,
)

# Snap day_of_week and is_weekend back to integers
df_boot['day_of_week']     = df_boot['day_of_week'].round().clip(0, 6).astype(int)
df_boot['is_weekend']      = df_boot['is_weekend'].round().clip(0, 1).astype(int)
df_boot['product_encoded'] = df_boot['product_encoded'].round().clip(0, 7).astype(int)
df_boot['predicted_demand']= df_boot['predicted_demand'].round().clip(0).astype(int)
df_boot = df_boot.reset_index(drop=True)

print(f'  After : {len(df_boot)} rows')
print(f'  risk_level after : {df_boot["risk_level"].value_counts().to_dict()}')
df_boot.to_csv(BOOT + '11_food_waste_ml_bootstrapped.csv', index=False)
print(f'  -> Saved: 11_food_waste_ml_bootstrapped.csv')


# ═════════════════════════════════════════════════════════════════════════════
# 2. GROCERY INVENTORY  — 990 -> 5,000 rows
#    Stratify by: Category + Status
#    Numeric cols: Stock_Quantity, Unit_Price, Sales_Volume,
#                  Inventory_Turnover_Rate, Reorder_Quantity, days_until_expiry
# ═════════════════════════════════════════════════════════════════════════════
print('\n=== 2. Grocery Inventory (990 -> 5,000) ===')
df = pd.read_csv(PROC + '7_grocery_inventory_cleaned.csv')
print(f'  Before: {len(df)} rows')
print(f'  Category before: {df["Category"].value_counts().to_dict()}')

num_cols = ['Stock_Quantity','Unit_Price','Sales_Volume',
            'Inventory_Turnover_Rate','Reorder_Quantity','days_until_expiry',
            'Reorder_Level','percentage']

# Stock and quantity must stay >= 0; price >= 0
clip_b = {
    'Stock_Quantity'          : (0, None),
    'Unit_Price'              : (0, None),
    'Sales_Volume'            : (0, None),
    'Reorder_Quantity'        : (0, None),
    'Reorder_Level'           : (0, None),
    'Inventory_Turnover_Rate' : (0, None),
}

df_boot = stratified_bootstrap(
    df,
    strat_cols  = ['Category', 'Status'],
    target_n    = 5000,
    numeric_cols= num_cols,
    clip_bounds = clip_b,
    sigma       = 0.01,
)

df_boot = df_boot.reset_index(drop=True)
print(f'  After : {len(df_boot)} rows')
print(f'  Category after: {df_boot["Category"].value_counts().to_dict()}')
df_boot.to_csv(BOOT + '7_grocery_inventory_bootstrapped.csv', index=False)
print(f'  -> Saved: 7_grocery_inventory_bootstrapped.csv')


# ═════════════════════════════════════════════════════════════════════════════
# 3. FOOD WASTE ARCHIVE  — 8,000 -> 25,000 rows
#    Stratify by: Food_Category + Waste_Level
#    Numeric cols: Purchase_Quantity, Units_Sold, Remaining_Stock,
#                  Shelf_Life_Days, Storage_Temperature, Daily_Demand,
#                  Waste_Quantity
# ═════════════════════════════════════════════════════════════════════════════
print('\n=== 3. Food Waste Archive (8,000 -> 25,000) ===')
df = pd.read_csv(PROC + '11_food_waste_archive_cleaned.csv')
print(f'  Before: {len(df)} rows')
print(f'  Waste_Level before: {df["Waste_Level"].value_counts().to_dict()}')
print(f'  Food_Category before: {df["Food_Category"].value_counts().to_dict()}')

num_cols = ['Purchase_Quantity','Units_Sold','Remaining_Stock',
            'Shelf_Life_Days','Storage_Temperature','Daily_Demand',
            'Waste_Quantity']

clip_b = {
    'Purchase_Quantity': (0, None),
    'Units_Sold'       : (0, None),
    'Remaining_Stock'  : (0, None),
    'Shelf_Life_Days'  : (0, None),
    'Daily_Demand'     : (0, None),
    'Waste_Quantity'   : (0, None),
    # Storage_Temperature can be negative (cold storage) — no lower clip
}

df_boot = stratified_bootstrap(
    df,
    strat_cols  = ['Food_Category', 'Waste_Level'],
    target_n    = 25000,
    numeric_cols= num_cols,
    clip_bounds = clip_b,
    sigma       = 0.01,
)

# Snap integer-natured columns
for col in ['Purchase_Quantity','Units_Sold','Remaining_Stock',
            'Daily_Demand','Waste_Quantity','Shelf_Life_Days']:
    if col in df_boot.columns:
        df_boot[col] = df_boot[col].round().clip(0).astype(int)

df_boot = df_boot.reset_index(drop=True)
print(f'  After : {len(df_boot)} rows')
print(f'  Waste_Level after : {df_boot["Waste_Level"].value_counts().to_dict()}')
print(f'  Food_Category after: {df_boot["Food_Category"].value_counts().to_dict()}')
df_boot.to_csv(BOOT + '11_food_waste_archive_bootstrapped.csv', index=False)
print(f'  -> Saved: 11_food_waste_archive_bootstrapped.csv')


# ═════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═════════════════════════════════════════════════════════════════════════════
print('\n=== BOOTSTRAPPING COMPLETE ===')
print(f'{"File":<50} {"Size MB":>8} {"Rows":>8}')
print('-' * 70)
for f in sorted(os.listdir(BOOT)):
    path = BOOT + f
    size = os.path.getsize(path) / 1024 / 1024
    rows = sum(1 for _ in open(path, encoding='utf-8')) - 1
    print(f'{f:<50} {size:>8.2f} {rows:>8,}')
