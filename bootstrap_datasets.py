"""
Bootstrapping pipeline — SMOTE / SMOTE-NC replacement for jitter method.

Fix 2 (2026-11-13): Replaced stratified jitter with SMOTE so that synthetic
rows respect the natural correlations between columns (e.g. HIGH RISK needs
simultaneously short shelf life + high waste — independent noise cannot do this).

Targets:
  11_food_waste_ml_cleaned.csv       :  1,000 ->  5,000  (SMOTE,    stratify: risk_level)
  7_grocery_inventory_cleaned.csv    :    990 ->  5,000  (SMOTE-NC, stratify: Category + Status)
  11_food_waste_archive_cleaned.csv  :  8,000 -> 25,000  (SMOTE-NC, stratify: Food_Category + Waste_Level)
"""

import pandas as pd
import numpy as np
import os
from collections import Counter
from imblearn.over_sampling import SMOTE, SMOTENC

PROC = 'data/processed/'
BOOT = 'data/processed/bootstrapped/'
os.makedirs(BOOT, exist_ok=True)

SEED = 42

# ══════════════════════════════════════════════════════════════════════════════
# HELPER: balance a dataset to target_n using SMOTE or SMOTE-NC
# ══════════════════════════════════════════════════════════════════════════════

def smote_upsample(df, target_col, target_n, cat_cols=None, seed=SEED):
    """
    Upsample df so every class in target_col has at least
    target_n // n_classes rows, then cap total at target_n.

    cat_cols: list of column names that are categorical (for SMOTE-NC).
              None or empty list -> plain SMOTE.
    """
    classes      = df[target_col].unique()
    n_classes    = len(classes)
    per_class    = max(target_n // n_classes, df[target_col].value_counts().max())

    # Build desired sampling strategy: each class -> per_class rows
    sampling     = {c: per_class for c in classes}
    # Never shrink a class that is already larger
    for c in classes:
        existing = (df[target_col] == c).sum()
        if existing > sampling[c]:
            sampling[c] = existing

    # Separate features (X) and label (y)
    X = df.drop(columns=[target_col])
    y = df[target_col]

    # Identify categorical column indices in X
    if cat_cols:
        cat_indices = [X.columns.get_loc(c) for c in cat_cols if c in X.columns]
    else:
        cat_indices = []

    # Encode categoricals as integer codes so SMOTE-NC can handle them
    encoders = {}
    for col in (cat_cols or []):
        if col in X.columns:
            codes, uniques = pd.factorize(X[col])
            encoders[col] = uniques          # save for decoding later
            X = X.copy()
            X[col] = codes

    # Also encode the target label if it's a string
    y_codes, y_uniques = pd.factorize(y)
    sampling_coded = {i: sampling[c] for i, c in enumerate(y_uniques)}
    # clip to only classes that actually exist in y_codes
    sampling_coded = {k: v for k, v in sampling_coded.items() if k in np.unique(y_codes)}

    if cat_indices:
        sm = SMOTENC(categorical_features=cat_indices,
                     sampling_strategy=sampling_coded,
                     random_state=seed, k_neighbors=5)
    else:
        sm = SMOTE(sampling_strategy=sampling_coded,
                   random_state=seed, k_neighbors=5)

    X_res, y_res = sm.fit_resample(X, y_codes)

    # Decode label back to original strings
    y_decoded = pd.Series([y_uniques[i] for i in y_res], name=target_col)

    # Decode categorical columns back to strings
    X_res_df = pd.DataFrame(X_res, columns=X.columns)
    for col, uniques in encoders.items():
        X_res_df[col] = X_res_df[col].round().astype(int).clip(0, len(uniques)-1)
        X_res_df[col] = [uniques[i] for i in X_res_df[col]]

    result = pd.concat([X_res_df, y_decoded], axis=1)

    # Trim to target_n if we overshot
    if len(result) > target_n:
        result = result.sample(n=target_n, random_state=seed).reset_index(drop=True)
    else:
        result = result.reset_index(drop=True)

    return result


# ══════════════════════════════════════════════════════════════════════════════
# 1. FOOD WASTE ML  — 1,000 -> 5,000  (all numeric -> SMOTE)
# ══════════════════════════════════════════════════════════════════════════════
print('\n=== 1. Food Waste ML (1,000 -> 5,000) ===')
df = pd.read_csv(PROC + '11_food_waste_ml_cleaned.csv')
print(f'  Before: {len(df)} rows')
print(f'  risk_level before: {df["risk_level"].value_counts().to_dict()}')

# Drop non-numeric helper column for SMOTE, re-attach after
# recommended_action is a string derived from risk_level — we'll re-derive it
action_map = df.groupby('risk_level')['recommended_action'].agg(lambda x: x.mode().iloc[0])

# Columns to keep for SMOTE (all numeric)
smote_cols = ['quantity','price','expiry_days','temperature',
              'day_of_week','is_weekend','predicted_demand','product_encoded']
df_smote   = df[smote_cols + ['risk_level']].copy()

df_boot = smote_upsample(df_smote, target_col='risk_level', target_n=5000, cat_cols=None)

# Snap integer-natured columns
for col in ['day_of_week','is_weekend','product_encoded','predicted_demand']:
    df_boot[col] = df_boot[col].round().astype(int)
df_boot['day_of_week']      = df_boot['day_of_week'].clip(0, 6)
df_boot['is_weekend']       = df_boot['is_weekend'].clip(0, 1)
df_boot['product_encoded']  = df_boot['product_encoded'].clip(0, 7)
df_boot['predicted_demand'] = df_boot['predicted_demand'].clip(0)

# Clip normalised [0,1] columns
for col in ['quantity','price','expiry_days','temperature']:
    df_boot[col] = df_boot[col].clip(0.0, 1.0)

# Re-attach recommended_action from risk_level
df_boot['recommended_action'] = df_boot['risk_level'].map(action_map)
df_boot = df_boot.reset_index(drop=True)

print(f'  After : {len(df_boot)} rows')
print(f'  risk_level after : {df_boot["risk_level"].value_counts().to_dict()}')
df_boot.to_csv(BOOT + '11_food_waste_ml_bootstrapped.csv', index=False)
print('  -> Saved: 11_food_waste_ml_bootstrapped.csv')


# ══════════════════════════════════════════════════════════════════════════════
# 2. GROCERY INVENTORY  — 990 -> 5,000  (mixed -> SMOTE-NC)
# ══════════════════════════════════════════════════════════════════════════════
print('\n=== 2. Grocery Inventory (990 -> 5,000) ===')
df = pd.read_csv(PROC + '7_grocery_inventory_cleaned.csv')
print(f'  Before: {len(df)} rows')
print(f'  Category dist: {df["Category"].value_counts().to_dict()}')

# Create a combined stratification label: Category|Status
df['_strat'] = df['Category'].astype(str) + '|' + df['Status'].astype(str)

# Columns to use: drop ID-like text columns that are unique per row
drop_cols = ['Product_ID','Supplier_ID','Product_Name','Supplier_Name',
             'Warehouse_Location','Date_Received','Last_Order_Date',
             'Expiration_Date','_strat']
feat_cols = [c for c in df.columns if c not in drop_cols + ['Category','Status']]

# Categoricals within features (none — Category/Status are the target label parts)
df_smote = df[feat_cols + ['_strat']].copy()
cat_cols_smote = []  # all numeric features after dropping text IDs

df_boot = smote_upsample(df_smote, target_col='_strat', target_n=5000,
                          cat_cols=cat_cols_smote)

# Split _strat back into Category + Status
df_boot[['Category','Status']] = df_boot['_strat'].str.split('|', expand=True)
df_boot = df_boot.drop(columns=['_strat'])

# Snap integer-natured columns
for col in ['Stock_Quantity','Reorder_Level','Reorder_Quantity','Sales_Volume',
            'Inventory_Turnover_Rate']:
    if col in df_boot.columns:
        df_boot[col] = df_boot[col].round().clip(0).astype(int)
df_boot = df_boot.reset_index(drop=True)

print(f'  After : {len(df_boot)} rows')
print(f'  Category dist after: {df_boot["Category"].value_counts().to_dict()}')
df_boot.to_csv(BOOT + '7_grocery_inventory_bootstrapped.csv', index=False)
print('  -> Saved: 7_grocery_inventory_bootstrapped.csv')


# ══════════════════════════════════════════════════════════════════════════════
# 3. FOOD WASTE ARCHIVE  — 8,000 -> 25,000  (mixed -> SMOTE-NC)
# ══════════════════════════════════════════════════════════════════════════════
print('\n=== 3. Food Waste Archive (8,000 -> 25,000) ===')
df = pd.read_csv(PROC + '11_food_waste_archive_cleaned.csv')
print(f'  Before: {len(df)} rows')
print(f'  Waste_Level dist: {df["Waste_Level"].value_counts().to_dict()}')
print(f'  Food_Category dist: {df["Food_Category"].value_counts().to_dict()}')

# Combined stratification label
df['_strat'] = df['Food_Category'].astype(str) + '|' + df['Waste_Level'].astype(str)

drop_cols = ['Inventory_ID','Date','Food_Category','Waste_Level',
             'Business_Type','_strat']
feat_cols = [c for c in df.columns if c not in drop_cols]

# Categorical features within feat_cols
cat_in_feat = [c for c in ['Promotion','Weather','Donation_Made','Waste_Reason'] if c in feat_cols]

df_smote = df[feat_cols + ['_strat']].copy()
df_boot = smote_upsample(df_smote, target_col='_strat', target_n=25000,
                          cat_cols=cat_in_feat)

# Split _strat back
df_boot[['Food_Category','Waste_Level']] = df_boot['_strat'].str.split('|', expand=True)
df_boot = df_boot.drop(columns=['_strat'])

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
print('  -> Saved: 11_food_waste_archive_bootstrapped.csv')


# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
print('\n=== BOOTSTRAPPING COMPLETE ===')
print(f'{"File":<50} {"Size MB":>8} {"Rows":>8}')
print('-' * 70)
for f in sorted(os.listdir(BOOT)):
    path = BOOT + f
    size = os.path.getsize(path) / 1024 / 1024
    rows = sum(1 for _ in open(path, encoding='utf-8')) - 1
    print(f'{f:<50} {size:>8.2f} {rows:>8,}')
