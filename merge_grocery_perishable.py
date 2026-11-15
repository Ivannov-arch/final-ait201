"""
merge_grocery_perishable.py
===========================
Merges 7_grocery_inventory_cleaned.csv (GI) with 7_perishable_goods_cleaned.csv (PG)
to create a richer training set for Person 1's spoilage risk classifier.

WHY THIS MERGE EXISTS:
  - GI has only 73 real HIGH-risk rows and 232 MODERATE rows out of 990 total.
    That's too few for the model to learn meaningful HIGH/MODERATE patterns from.
  - PG has 89,880 rows with real spoilage tracking across 9 food categories.
    Applying Person 1's same thresholds yields 79,957 HIGH, 1,712 MODERATE,
    8,211 LOW — genuine real-world diversity that SMOTE cannot invent.
  - By merging (with PG undersampled to avoid drowning GI), the model gets
    real, varied HIGH and MODERATE examples from a genuinely different context.

OUTPUT FILES (no existing files are changed):
  data/processed/7_grocery_perishable_merged.csv
      -> Cleaned, merged, labelled — ready for model training or inspection
  data/processed/bootstrapped/7_grocery_perishable_merged_bootstrapped.csv
      -> SMOTE-balanced version of the above, with is_synthetic column

COLUMN MAPPING  (PG -> GI equivalent):
  initial_quantity         -> Stock_Quantity
  base_price               -> Unit_Price
  units_sold               -> Sales_Volume
  units_sold/initial_qty*100 -> Inventory_Turnover_Rate  (derived)
  waste_pct / 100          -> percentage                 (normalised to [0,1])
  days_until_expiry        -> days_until_expiry          (direct)
  Reorder_Quantity         -> imputed from GI category medians (PG has no equivalent)
  Reorder_Level            -> imputed from GI category medians (PG has no equivalent)
"""

import pandas as pd
import numpy as np
import os
from imblearn.over_sampling import SMOTE

PROC = 'data/processed/'
BOOT = 'data/processed/bootstrapped/'
SEED = 42

os.makedirs(BOOT, exist_ok=True)

# ══════════════════════════════════════════════════════════════════════════════
# STEP 1 — Load both datasets
# ══════════════════════════════════════════════════════════════════════════════
print('=' * 65)
print('STEP 1: Loading datasets')
print('=' * 65)

gi = pd.read_csv(PROC + '7_grocery_inventory_cleaned.csv')
pg = pd.read_csv(PROC + '7_perishable_goods_cleaned.csv')

print(f'  GI  loaded : {len(gi):,} rows, {gi.shape[1]} columns')
print(f'  PG  loaded : {len(pg):,} rows, {pg.shape[1]} columns')


# ══════════════════════════════════════════════════════════════════════════════
# STEP 2 — Define Person 1's risk label (same thresholds as test_person1_ml.py)
# ══════════════════════════════════════════════════════════════════════════════
print('\n' + '=' * 65)
print('STEP 2: Deriving spoilage_risk labels')
print('=' * 65)

def derive_risk(days_series):
    return np.select(
        [days_series <= 30,
         (days_series > 30) & (days_series <= 90)],
        ['HIGH', 'MODERATE'],
        default='LOW'
    )

gi['spoilage_risk'] = derive_risk(gi['days_until_expiry'])
pg['spoilage_risk'] = derive_risk(pg['days_until_expiry'])

print(f'  GI  risk dist  : {gi["spoilage_risk"].value_counts().to_dict()}')
print(f'  PG  risk dist  : {pg["spoilage_risk"].value_counts().to_dict()}')


# ══════════════════════════════════════════════════════════════════════════════
# STEP 3 — Prepare GI rows
# ══════════════════════════════════════════════════════════════════════════════
print('\n' + '=' * 65)
print('STEP 3: Preparing GI rows')
print('=' * 65)

gi_prep = gi.copy()

# Clip percentage to [0, 1] — raw GI has a few negative artefacts
gi_prep['percentage'] = gi_prep['percentage'].clip(0.0, 1.0)

gi_prep['source']        = 'GI'
gi_prep['Supplier_Name'] = gi_prep['Supplier_Name']   # already present
gi_prep['Warehouse_Location'] = gi_prep['Warehouse_Location']

print(f'  GI rows kept      : {len(gi_prep)}')
print(f'  percentage clipped: negatives -> 0.0')


# ══════════════════════════════════════════════════════════════════════════════
# STEP 4 — Prepare PG rows: map columns to GI schema
# ══════════════════════════════════════════════════════════════════════════════
print('\n' + '=' * 65)
print('STEP 4: Mapping PG columns to GI schema')
print('=' * 65)

# --- 4a. Category harmonisation ---
# PG uses different naming for some categories — standardise to GI conventions
# where there is a clear match; keep PG-only categories as-is (they add breadth)
CATEGORY_MAP = {
    'Produce'     : 'Fruits & Vegetables',   # direct semantic equivalent
    'Bakery'      : 'Bakery',
    'Dairy'       : 'Dairy',
    'Seafood'     : 'Seafood',
    'Beverages'   : 'Beverages',
    'Meat'        : 'Meat',           # no GI equivalent — kept for breadth
    'Ready_to_Eat': 'Ready to Eat',   # no GI equivalent — kept for breadth
    'Deli'        : 'Deli',           # no GI equivalent — kept for breadth
    'Frozen_Meals': 'Frozen Meals',   # no GI equivalent — kept for breadth
}
pg['Category'] = pg['category'].map(CATEGORY_MAP).fillna(pg['category'])

# --- 4b. Reorder_Quantity and Reorder_Level ---
# PG has no warehouse reorder fields. Impute using GI category medians.
# For PG categories with no GI equivalent, use GI-wide median as fallback.
cat_med_rq = gi.groupby('Category')['Reorder_Quantity'].median()
cat_med_rl = gi.groupby('Category')['Reorder_Level'].median()
fallback_rq = int(gi['Reorder_Quantity'].median())
fallback_rl = int(gi['Reorder_Level'].median())

pg['Reorder_Quantity'] = (
    pg['Category'].map(cat_med_rq).fillna(fallback_rq).round().astype(int)
)
pg['Reorder_Level'] = (
    pg['Category'].map(cat_med_rl).fillna(fallback_rl).round().astype(int)
)

# --- 4c. Inventory_Turnover_Rate ---
# GI range: 1-100 (integer). Derive from units_sold / initial_quantity * 100.
# Clipped to [0, 100] to stay in GI's domain.
pg['Inventory_Turnover_Rate'] = (
    (pg['units_sold'] / pg['initial_quantity'].replace(0, np.nan)) * 100
).clip(0, 100).fillna(0).round().astype(int)

# --- 4d. percentage (waste fraction [0,1]) ---
# GI percentage is waste fraction (0.0 to ~1.0). PG waste_pct is 0-100.
pg['percentage'] = (pg['waste_pct'] / 100).clip(0.0, 1.0)

# --- 4e. Direct numeric mappings ---
pg['Stock_Quantity']  = pg['initial_quantity'].clip(10, 100).astype(int)
pg['Unit_Price']      = pg['base_price']
pg['Sales_Volume']    = pg['units_sold'].clip(0).astype(int)

# --- 4f. Text / identity columns ---
pg['Product_Name']        = pg['product_name']
pg['Product_ID']          = pg['product_id']
pg['Supplier_ID']         = pg['supplier_id']
pg['Supplier_Name']       = pg['supplier_id']      # PG has no supplier name; use ID
pg['Warehouse_Location']  = pg['region']            # closest PG equivalent
pg['Status']              = np.nan                  # PG has no stock Status field
pg['source']              = 'PG'

print('  Column mappings applied:')
print('    initial_quantity       -> Stock_Quantity   (clipped 10-100)')
print('    base_price             -> Unit_Price')
print('    units_sold             -> Sales_Volume')
print('    units_sold/initial*100 -> Inventory_Turnover_Rate (0-100)')
print('    waste_pct / 100        -> percentage (0.0-1.0)')
print('    region                 -> Warehouse_Location')
print('    supplier_id            -> Supplier_Name  (placeholder)')
print('    Reorder_Quantity/Level -> imputed from GI category medians')
print(f'      Fallback median  Reorder_Quantity={fallback_rq}, Reorder_Level={fallback_rl}')


# ══════════════════════════════════════════════════════════════════════════════
# STEP 5 — Undersample PG to prevent it drowning GI
# ══════════════════════════════════════════════════════════════════════════════
print('\n' + '=' * 65)
print('STEP 5: Undersampling PG (equalise classes before merge)')
print('=' * 65)

# PG raw: HIGH 79,957 / MODERATE 1,712 / LOW 8,211
# MODERATE is the bottleneck — cap all PG classes at MODERATE count
# so no PG class overwhelms the other, and GI stays meaningful
moderate_n = pg[pg['spoilage_risk'] == 'MODERATE'].shape[0]  # 1,712
print(f'  PG MODERATE count (bottleneck): {moderate_n:,}')
print(f'  Sampling each PG class to max {moderate_n:,} rows')

pg_sampled_parts = []
for cls in ['HIGH', 'MODERATE', 'LOW']:
    cls_df = pg[pg['spoilage_risk'] == cls]
    n = min(len(cls_df), moderate_n)
    pg_sampled_parts.append(cls_df.sample(n=n, random_state=SEED))

pg_sampled = pd.concat(pg_sampled_parts, ignore_index=True)
print(f'  PG after sampling : {pg_sampled["spoilage_risk"].value_counts().to_dict()}')
print(f'  PG rows used      : {len(pg_sampled):,} of {len(pg):,}')


# ══════════════════════════════════════════════════════════════════════════════
# STEP 6 — Align columns and concatenate
# ══════════════════════════════════════════════════════════════════════════════
print('\n' + '=' * 65)
print('STEP 6: Aligning columns and concatenating')
print('=' * 65)

# Final column set — matches Person 1's feature set + identity + meta columns
FINAL_COLS = [
    # Identity / text
    'Product_Name', 'Product_ID', 'Supplier_ID', 'Supplier_Name',
    'Warehouse_Location', 'Category', 'Status', 'source',
    # Person 1 numeric features
    'Stock_Quantity', 'Unit_Price', 'Sales_Volume',
    'Inventory_Turnover_Rate', 'Reorder_Quantity', 'Reorder_Level',
    'percentage', 'days_until_expiry',
    # Target label
    'spoilage_risk',
]

gi_final = gi_prep[FINAL_COLS].copy()
pg_final = pg_sampled[FINAL_COLS].copy()

merged = pd.concat([gi_final, pg_final], ignore_index=True).reset_index(drop=True)

print(f'  GI  rows : {len(gi_final):,}')
print(f'  PG  rows : {len(pg_final):,}')
print(f'  Total    : {len(merged):,}')
print(f'  Risk dist: {merged["spoilage_risk"].value_counts().to_dict()}')
print(f'  Source   : {merged["source"].value_counts().to_dict()}')
print(f'  Columns  : {merged.shape[1]}')


# ══════════════════════════════════════════════════════════════════════════════
# STEP 7 — Save unbootstrapped merged file
# ══════════════════════════════════════════════════════════════════════════════
print('\n' + '=' * 65)
print('STEP 7: Saving unbootstrapped merged file')
print('=' * 65)

out_merged = PROC + '7_grocery_perishable_merged.csv'
merged.to_csv(out_merged, index=False)
size_mb = os.path.getsize(out_merged) / 1024 / 1024
print(f'  -> Saved: {out_merged}')
print(f'     Size : {size_mb:.2f} MB  |  Rows: {len(merged):,}')


# ══════════════════════════════════════════════════════════════════════════════
# STEP 8 — Bootstrap (SMOTE) the merged dataset
# ══════════════════════════════════════════════════════════════════════════════
print('\n' + '=' * 65)
print('STEP 8: Bootstrapping merged dataset with SMOTE -> 5,000 rows')
print('=' * 65)

TARGET     = 'spoilage_risk'
FEAT_COLS  = ['Stock_Quantity', 'Unit_Price', 'Sales_Volume',
              'Inventory_Turnover_Rate', 'Reorder_Quantity',
              'Reorder_Level', 'percentage', 'days_until_expiry']
TEXT_COLS  = ['Product_Name', 'Product_ID', 'Supplier_ID', 'Supplier_Name',
              'Warehouse_Location', 'Category', 'Status', 'source']
ID_COLS    = ['Product_ID', 'Supplier_ID']
TARGET_N   = 5000

# --- SMOTE on numeric features only ---
df_smote = merged[FEAT_COLS + [TARGET]].copy()

X = df_smote[FEAT_COLS]
y = df_smote[TARGET]
n_original = len(X)

y_codes, y_uniques = pd.factorize(y)

# Balance all classes to equal share of TARGET_N
per_class = TARGET_N // len(y_uniques)
sampling = {}
for i, cls in enumerate(y_uniques):
    existing = int((y == cls).sum())
    sampling[i] = max(per_class, existing)
# keep only classes present
sampling = {k: v for k, v in sampling.items() if k in np.unique(y_codes)}

sm = SMOTE(sampling_strategy=sampling, random_state=SEED, k_neighbors=5)
X_res, y_res = sm.fit_resample(X, y_codes)

is_synthetic = [False] * n_original + [True] * (len(X_res) - n_original)

y_decoded = pd.Series([y_uniques[i] for i in y_res], name=TARGET)
X_res_df  = pd.DataFrame(X_res, columns=FEAT_COLS)

boot = pd.concat([X_res_df, y_decoded], axis=1)
boot['is_synthetic'] = is_synthetic

# Trim to TARGET_N
if len(boot) > TARGET_N:
    boot = boot.sample(n=TARGET_N, random_state=SEED).reset_index(drop=True)
else:
    boot = boot.reset_index(drop=True)

# Snap integer columns
for col in ['Stock_Quantity', 'Sales_Volume', 'Inventory_Turnover_Rate',
            'Reorder_Quantity', 'Reorder_Level']:
    boot[col] = boot[col].round().clip(0).astype(int)

boot['days_until_expiry'] = boot['days_until_expiry'].round().clip(0).astype(int)
boot['Unit_Price']        = boot['Unit_Price'].clip(0.0)
boot['percentage']        = boot['percentage'].clip(0.0, 1.0)

print(f'  SMOTE complete')
print(f'  Total rows     : {len(boot):,}')
print(f'  Synthetic rows : {boot["is_synthetic"].sum():,}')
print(f'  Risk dist      : {boot["spoilage_risk"].value_counts().to_dict()}')

# --- Re-attach text columns via group sampling (same logic as bootstrap_datasets.py) ---
print('  Re-attaching text columns by group sampling...')
rng = np.random.default_rng(SEED)
orig_groups = {}
for key, grp in merged.groupby(['Category', 'spoilage_risk']):
    orig_groups[key] = grp.reset_index(drop=True)

attached = []
syn_ctr  = 0

for _, row in boot.iterrows():
    # Match group: re-derive category from spoilage_risk since SMOTE only
    # touched numeric cols — we use spoilage_risk as the grouping signal
    # (Category is numeric-encoded via SMOTE so we find nearest group by risk)
    risk = row['spoilage_risk']
    # Find any group with matching risk level
    matching_keys = [k for k in orig_groups if k[1] == risk]
    if matching_keys:
        key = matching_keys[rng.integers(0, len(matching_keys))]
        grp = orig_groups[key]
    else:
        grp = merged

    pick     = grp.iloc[rng.integers(0, len(grp))]
    txt_row  = {col: pick[col] for col in TEXT_COLS if col in pick.index}

    if row.get('is_synthetic', False):
        syn_ctr += 1
        if 'Product_Name' in txt_row and pd.notna(txt_row['Product_Name']):
            txt_row['Product_Name'] = f'[Synthetic] {txt_row["Product_Name"]}'
        for id_col in ID_COLS:
            if id_col in txt_row:
                txt_row[id_col] = f'SYN-{syn_ctr:05d}'

    attached.append(txt_row)

text_df = pd.DataFrame(attached, index=boot.index)
boot_full = pd.concat([text_df, boot], axis=1)

# Column order: text first, then features, then target, then meta
col_order = TEXT_COLS + FEAT_COLS + [TARGET, 'is_synthetic']
boot_full = boot_full[col_order].reset_index(drop=True)

# ══════════════════════════════════════════════════════════════════════════════
# STEP 9 — Save bootstrapped file
# ══════════════════════════════════════════════════════════════════════════════
print('\n' + '=' * 65)
print('STEP 9: Saving bootstrapped file')
print('=' * 65)

out_boot = BOOT + '7_grocery_perishable_merged_bootstrapped.csv'
boot_full.to_csv(out_boot, index=False)
size_boot = os.path.getsize(out_boot) / 1024 / 1024
print(f'  -> Saved: {out_boot}')
print(f'     Size : {size_boot:.2f} MB  |  Rows: {len(boot_full):,}')
print(f'     Synthetic sample: {boot_full[boot_full["is_synthetic"]]["Product_Name"].head(5).tolist()}')


# ══════════════════════════════════════════════════════════════════════════════
# FINAL SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
print('\n' + '=' * 65)
print('MERGE COMPLETE — SUMMARY')
print('=' * 65)
print(f'{"File":<55} {"Rows":>6}  {"HIGH":>6}  {"MOD":>6}  {"LOW":>6}')
print('-' * 65)

for path, label in [(out_merged, 'Unbootstrapped'), (out_boot, 'Bootstrapped')]:
    df = pd.read_csv(path)
    rc = df['spoilage_risk'].value_counts()
    print(f'{path.split("/")[-1]:<55} {len(df):>6,}  '
          f'{rc.get("HIGH",0):>6,}  {rc.get("MODERATE",0):>6,}  {rc.get("LOW",0):>6,}')

print()
print('Compare to BEFORE merge (GI alone):')
print(f'  HIGH     :  73 real rows  ->  now 1,785 real rows in merged')
print(f'  MODERATE : 232 real rows  ->  now 1,944 real rows in merged')
print(f'  LOW      : 685 real rows  ->  now 2,397 real rows in merged')
print()
print('These are all REAL rows with genuine spoilage patterns from two')
print('different operational contexts — not SMOTE interpolations.')
