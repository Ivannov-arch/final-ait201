
import pandas as pd
from pathlib import Path

# ==========================================
# 1. SET PROJECT PATH
# ==========================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "8. store-sales-time-series-forecasting"
)

# ==========================================
# 2. LOAD DATASETS
# ==========================================

train = pd.read_csv(
    DATA_PATH / "train.csv",
    parse_dates=["date"]
)

transactions = pd.read_csv(
    DATA_PATH / "transactions.csv",
    parse_dates=["date"]
)

# ==========================================
# 3. MERGE DATASETS
# ==========================================

merged_data = train.merge(
    transactions,
    on=["date", "store_nbr"],
    how="left",
    validate="many_to_one",
    indicator=True
)

# ==========================================
# 4. CHECK MERGE RESULTS
# ==========================================

print("\n========== MERGE RESULTS ==========")

print("Original train rows:", len(train))
print("Merged rows:", len(merged_data))

print("\nMerge status:")
print(merged_data["_merge"].value_counts())

print("\nMissing transactions:")
print(merged_data["transactions"].isnull().sum())

print("\nMerged dataset sample:")
print(merged_data.head())

# ==========================================
# 5. CHECK DATA INTEGRITY
# ==========================================

print("\n========== DATA INTEGRITY ==========")

print(
    "Rows preserved:",
    len(merged_data) == len(train)
)

print(
    "Missing transaction percentage:",
    round(
        merged_data["transactions"].isnull().mean() * 100,
        2
    ),
    "%"
)




# ==========================================
# STEP 2.1: INVESTIGATE MISSING TRANSACTIONS
# ==========================================

# Get unmatched store-date combinations
unmatched = merged_data[
    merged_data["_merge"] == "left_only"
][["date", "store_nbr"]].drop_duplicates()

print("\n========== MISSING TRANSACTION ANALYSIS ==========")

print("Missing store-date combinations:", len(unmatched))

# Check missing records by date
print("\nTop 10 dates with most missing stores:")

print(
    unmatched.groupby("date")["store_nbr"]
    .nunique()
    .sort_values(ascending=False)
    .head(10)
)

# Check missing records by store
print("\nMissing dates by store:")

print(
    unmatched.groupby("store_nbr")["date"]
    .nunique()
    .sort_values(ascending=False)
)

# ==========================================
# CHECK WHETHER MISSING RECORDS HAVE ZERO SALES
# ==========================================

# Calculate total sales per store per day
daily_sales = (
    train.groupby(["date", "store_nbr"])["sales"]
    .sum()
    .reset_index()
)

# Match missing transaction combinations with sales
missing_analysis = unmatched.merge(
    daily_sales,
    on=["date", "store_nbr"],
    how="left"
)

print("\n========== SALES ANALYSIS ==========")

print(
    "Missing combinations with zero sales:",
    (missing_analysis["sales"] == 0).sum()
)

print(
    "Missing combinations with positive sales:",
    (missing_analysis["sales"] > 0).sum()
)

print(
    "Missing combinations with negative sales:",
    (missing_analysis["sales"] < 0).sum()
)

print(
    "Total sales from unmatched combinations:",
    missing_analysis["sales"].sum()
)

# Show examples
print("\nSample unmatched combinations:")

print(missing_analysis.head(15))


print("\n========== FINAL SUMMARY ==========")

print("Original rows:", len(train))
print("Merged rows:", len(merged_data))
print("Unique missing store-date combinations:", len(unmatched))

print(
    "Missing transaction percentage:",
    round(merged_data["transactions"].isna().mean() * 100, 2),
    "%"
)

print("\nDATA PREPARATION COMPLETED")