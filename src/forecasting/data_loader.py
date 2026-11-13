
import pandas as pd
from pathlib import Path

# Get the project root directory
PROJECT_ROOT = Path(__file__).resolve().parents[2]

# Correct dataset location
DATA_PATH = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "8. store-sales-time-series-forecasting"
)

# Load training data
train = pd.read_csv(
    DATA_PATH / "train.csv",
    parse_dates=["date"]
)

# Load transactions data
transactions = pd.read_csv(
    DATA_PATH / "transactions.csv",
    parse_dates=["date"]
)

# Display training data
print("\n========== TRAIN DATA ==========")
print(train.head())
print("\nTrain information:")
print(train.info())

# Display transactions data
print("\n========== TRANSACTIONS DATA ==========")
print(transactions.head())
print("\nTransactions information:")
print(transactions.info())

print("\n========== DATA LOADING SUCCESSFUL ==========")



# ==========================================
# STEP 2: DATA UNDERSTANDING
# ==========================================

print("\n========== TRAIN DATASET SHAPE ==========")
print(train.shape)

print("\n========== TRANSACTIONS DATASET SHAPE ==========")
print(transactions.shape)


# Check column names
print("\n========== TRAIN COLUMNS ==========")
print(train.columns.tolist())

print("\n========== TRANSACTION COLUMNS ==========")
print(transactions.columns.tolist())


# Check missing values
print("\n========== TRAIN MISSING VALUES ==========")
print(train.isnull().sum())

print("\n========== TRANSACTIONS MISSING VALUES ==========")
print(transactions.isnull().sum())


# Check duplicate records
print("\n========== DUPLICATE RECORDS ==========")
print("Train:", train.duplicated().sum())
print("Transactions:", transactions.duplicated().sum())


# Check date range
print("\n========== DATE RANGE ==========")

print("Train:")
print("Start:", train["date"].min())
print("End:", train["date"].max())

print("\nTransactions:")
print("Start:", transactions["date"].min())
print("End:", transactions["date"].max())


# Check number of stores
print("\n========== NUMBER OF STORES ==========")
print("Train:", train["store_nbr"].nunique())
print("Transactions:", transactions["store_nbr"].nunique())


# Display sample records
print("\n========== TRAIN SAMPLE ==========")
print(train.head())

print("\n========== TRANSACTIONS SAMPLE ==========")
print(transactions.head())
