import pandas as pd
import numpy as np
import os

RAW = 'data/raw/'
OUT = 'data/processed/'
os.makedirs(OUT, exist_ok=True)

# ─────────────────────────────────────────────────────────────────
# 1. GROCERY INVENTORY — Step 7 primary
#    Issues: col typo 'Catagory', 1 null (Cabbage), '$' in Unit_Price, '022%' in percentage
# ─────────────────────────────────────────────────────────────────
print('\n=== 1. Grocery Inventory ===')
df = pd.read_csv(RAW + '7. Grocery_Inventory new v1.csv')
df = df.rename(columns={'Catagory': 'Category'})
df.at[572, 'Category'] = 'Fruits & Vegetables'

df['Unit_Price'] = df['Unit_Price'].astype(str).str.replace('$', '', regex=False).str.strip()
df['Unit_Price'] = pd.to_numeric(df['Unit_Price'], errors='coerce')

df['percentage'] = df['percentage'].astype(str).str.replace('%', '', regex=False).str.strip()
df['percentage'] = pd.to_numeric(df['percentage'], errors='coerce') / 100

print(f'  Rows: {len(df)} | Nulls: {df.isnull().sum().sum()} | Dupes: {df.duplicated().sum()}')
df.to_csv(OUT + '7_grocery_inventory_cleaned.csv', index=False)
print('  -> Saved: 7_grocery_inventory_cleaned.csv')

# ─────────────────────────────────────────────────────────────────
# 2. PERISHABLE GOODS — Step 7 supporting
#    Non-food: Pharmaceuticals (remove)
# ─────────────────────────────────────────────────────────────────
print('\n=== 2. Perishable Goods ===')
df = pd.read_csv(RAW + '7. perishable_goods_management.csv')
print(f'  Before: {len(df)} rows | Categories: {list(df["category"].unique())}')
df = df[df['category'] != 'Pharmaceuticals'].reset_index(drop=True)
print(f'  After (removed Pharmaceuticals): {len(df)} rows')
print(f'  Nulls: {df.isnull().sum().sum()} | Dupes: {df.duplicated().sum()}')
df.to_csv(OUT + '7_perishable_goods_cleaned.csv', index=False)
print('  -> Saved: 7_perishable_goods_cleaned.csv')

# ─────────────────────────────────────────────────────────────────
# 3. M5 TRAIN.CSV — Step 8 primary
#    Remove all non-food product families
# ─────────────────────────────────────────────────────────────────
print('\n=== 3. M5 Train ===')
df = pd.read_csv(RAW + '8. store-sales-time-series-forecasting/train.csv')
print(f'  Before: {len(df)} rows')
print(f'  All families: {sorted(df["family"].unique())}')

FOOD_FAMILIES = {
    'BEVERAGES', 'BREAD/BAKERY', 'DAIRY', 'DELI', 'EGGS',
    'FROZEN FOODS', 'GROCERY I', 'GROCERY II', 'LIQUOR,WINE,BEER',
    'MEATS', 'POULTRY', 'PREPARED FOODS', 'PRODUCE', 'SEAFOOD',
}
df = df[df['family'].isin(FOOD_FAMILIES)].reset_index(drop=True)
print(f'  After (food only): {len(df)} rows')
print(f'  Remaining families: {sorted(df["family"].unique())}')
print(f'  Nulls: {df.isnull().sum().sum()} | Dupes: {df.duplicated().sum()}')
df.to_csv(OUT + '8_m5_train_food_cleaned.csv', index=False)
print('  -> Saved: 8_m5_train_food_cleaned.csv')

# ─────────────────────────────────────────────────────────────────
# 4. M5 COMPANION FILES — dimension tables, no filtering needed
#    oil.csv: 43 holiday nulls -> forward fill
# ─────────────────────────────────────────────────────────────────
print('\n=== 4. M5 Companion files ===')

companions = {
    'stores': '8. store-sales-time-series-forecasting/stores.csv',
    'oil': '8. store-sales-time-series-forecasting/oil.csv',
    'holidays_events': '8. store-sales-time-series-forecasting/holidays_events.csv',
    'transactions': '8. store-sales-time-series-forecasting/transactions.csv',
}

for name, path in companions.items():
    cf = pd.read_csv(RAW + path)
    if name == 'oil':
        cf = cf.sort_values('date').reset_index(drop=True)
        before = cf['dcoilwtico'].isnull().sum()
        cf['dcoilwtico'] = cf['dcoilwtico'].ffill()
        print(f'  oil.csv: forward-filled {before} holiday nulls')
    cf = cf.drop_duplicates().reset_index(drop=True)
    out_name = f'8_{name}_cleaned.csv'
    cf.to_csv(OUT + out_name, index=False)
    print(f'  {name}: {len(cf)} rows | Nulls: {cf.isnull().sum().sum()} -> {out_name}')

# ─────────────────────────────────────────────────────────────────
# 5. RETAIL SALES FORECAST — Step 8 supporting
#    Keep only 'Groceries' from Product_Category
# ─────────────────────────────────────────────────────────────────
print('\n=== 5. Retail Sales Forecast ===')
df = pd.read_csv(RAW + 'retail_sales_forecast_dataset.csv')
print(f'  Before: {len(df)} rows | Categories: {list(df["Product_Category"].unique())}')
df = df[df['Product_Category'] == 'Groceries'].reset_index(drop=True)
print(f'  After (Groceries only): {len(df)} rows')
print(f'  Subcategories: {list(df["Product_Subcategory"].unique())}')
print(f'  Nulls: {df.isnull().sum().sum()} | Dupes: {df.duplicated().sum()}')
df.to_csv(OUT + '8_retail_sales_food_cleaned.csv', index=False)
print('  -> Saved: 8_retail_sales_food_cleaned.csv')

# ─────────────────────────────────────────────────────────────────
# 6. FOOD WASTE ML 1000 — Step 11 primary
#    All food — no filtering. Already clean and ML-ready.
# ─────────────────────────────────────────────────────────────────
print('\n=== 6. Food Waste ML (1000) ===')
df = pd.read_csv(RAW + '11. food_waste_ml_1000.csv')
print(f'  Rows: {len(df)} | Nulls: {df.isnull().sum().sum()} | Dupes: {df.duplicated().sum()}')
df.to_csv(OUT + '11_food_waste_ml_cleaned.csv', index=False)
print('  -> Saved: 11_food_waste_ml_cleaned.csv')

# ─────────────────────────────────────────────────────────────────
# 7. FOOD WASTE ARCHIVE — Step 11 supporting
#    Nulls: Shelf_Life_Days(235), Storage_Temperature(186),
#           Daily_Demand(210), Weather(203), Donation_Made(233)
#    Strategy: category-level median/mode imputation
# ─────────────────────────────────────────────────────────────────
print('\n=== 7. Food Waste Archive ===')
df = pd.read_csv(RAW + '11. archive/food_waste_dataset.csv')
print(f'  Before: {len(df)} rows')
print(f'  Nulls before: {dict(df.isnull().sum()[df.isnull().sum()>0])}')

# Numeric: median per Food_Category
df['Shelf_Life_Days'] = df.groupby('Food_Category')['Shelf_Life_Days'].transform(
    lambda x: x.fillna(x.median())
)
df['Storage_Temperature'] = df.groupby('Food_Category')['Storage_Temperature'].transform(
    lambda x: x.fillna(x.median())
)
# Daily_Demand: median per Food_Category + Business_Type
df['Daily_Demand'] = df.groupby(['Food_Category', 'Business_Type'])['Daily_Demand'].transform(
    lambda x: x.fillna(x.median())
)
# Categorical: mode per Business_Type
df['Weather'] = df.groupby('Business_Type')['Weather'].transform(
    lambda x: x.fillna(x.mode().iloc[0] if not x.mode().empty else 'Sunny')
)
df['Donation_Made'] = df.groupby('Business_Type')['Donation_Made'].transform(
    lambda x: x.fillna(x.mode().iloc[0] if not x.mode().empty else 'No')
)

print(f'  Nulls after: {df.isnull().sum().sum()}')
print(f'  Dupes: {df.duplicated().sum()}')
df.to_csv(OUT + '11_food_waste_archive_cleaned.csv', index=False)
print('  -> Saved: 11_food_waste_archive_cleaned.csv')

# ─────────────────────────────────────────────────────────────────
# 8. PRICECATCHER — Step 11 DOSM
#    Already clean — no nulls, no dupes. Pass through.
# ─────────────────────────────────────────────────────────────────
print('\n=== 8. PriceCatcher ===')
df = pd.read_csv(RAW + '11. pricecatcher_2026-10.csv')
print(f'  Rows: {len(df)} | Nulls: {df.isnull().sum().sum()} | Dupes: {df.duplicated().sum()}')
df.to_csv(OUT + '11_pricecatcher_cleaned.csv', index=False)
print('  -> Saved: 11_pricecatcher_cleaned.csv')

print('\n=== ALL DONE ===')
print('Files in data/processed/:')
for f in sorted(os.listdir(OUT)):
    size = os.path.getsize(OUT + f) / 1024 / 1024
    print(f'  {f}  ({size:.1f} MB)')
