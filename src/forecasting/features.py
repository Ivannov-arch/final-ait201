
import pandas as pd
from pathlib import Path

# ==========================================
# 1. PROJECT PATHS
# ==========================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = (
    PROJECT_ROOT
    / "data"
    / "processed"
    / "8_m5_train_food_cleaned.csv"
)

OUTPUT_PATH = PROJECT_ROOT / "data" / "processed"

OUTPUT_PATH.mkdir(parents=True, exist_ok=True)

# ==========================================
# 2. LOAD FOOD SALES DATA
# ==========================================

print("\n========== LOADING FOOD DATA ==========")

df = pd.read_csv(
    DATA_PATH,
    parse_dates=["date"]
)

print("Original dataset shape:", df.shape)

# ==========================================
# 3. SORT AND VALIDATE DATA
# ==========================================

df = df.sort_values(
    ["store_nbr", "family", "date"]
).reset_index(drop=True)

if df.duplicated(
    subset=["date", "store_nbr", "family"]
).any():
    raise ValueError("Duplicate store-family-date records found.")

# Preserve original observations
df["observed"] = True

# ==========================================
# 4. CREATE COMPLETE DAILY CALENDAR
# ==========================================

print("\n========== CREATING DAILY CALENDAR ==========")

all_dates = pd.date_range(
    start=df["date"].min(),
    end=df["date"].max(),
    freq="D"
)

groups = []

for (store, family), group in df.groupby(
    ["store_nbr", "family"],
    sort=False
):

    group = group.set_index("date")

    group = group.reindex(all_dates)

    group["store_nbr"] = store
    group["family"] = family

    # Identify original versus inserted dates
    group["observed"] = (
        group["observed"]
        .astype("boolean")
        .fillna(False)
        .astype(bool)
    )

    # Provisional assumption:
    # Missing Christmas dates represent zero operational sales.
    group["sales"] = group["sales"].fillna(0)

    groups.append(group)

history = pd.concat(groups)

history.index.name = "date"

history = history.reset_index()

history = history.sort_values(
    ["store_nbr", "family", "date"]
).reset_index(drop=True)

print("Complete calendar shape:", history.shape)

print(
    "Inserted calendar records:",
    (~history["observed"]).sum()
)

# ==========================================
# 5. CREATE HISTORICAL FEATURES
# ==========================================

print("\n========== CREATING LAG FEATURES ==========")

grouped_sales = history.groupby(
    ["store_nbr", "family"]
)["sales"]

history["lag_1"] = grouped_sales.shift(1)
history["lag_2"] = grouped_sales.shift(2)
history["lag_3"] = grouped_sales.shift(3)
history["lag_7"] = grouped_sales.shift(7)
history["lag_14"] = grouped_sales.shift(14)

history["rolling_mean_7"] = grouped_sales.transform(
    lambda x: x.shift(1).rolling(7).mean()
)

history["rolling_mean_14"] = grouped_sales.transform(
    lambda x: x.shift(1).rolling(14).mean()
)

# ==========================================
# 6. CREATE FORECAST CALENDAR FEATURES
# ==========================================

print("\n========== CREATING CALENDAR FEATURES ==========")

# The forecast date is the target date, not the origin date.

# ==========================================
# 7. CREATE THREE DIRECT FORECAST DATASETS
# ==========================================

feature_columns = [
    "store_nbr",
    "family",
    "lag_1",
    "lag_2",
    "lag_3",
    "lag_7",
    "lag_14",
    "rolling_mean_7",
    "rolling_mean_14"
]

for horizon in [1, 2, 3]:

    print(f"\n========== BUILDING DAY +{horizon} DATA ==========")

    data = history.copy()

    # Future target sales
    data["target"] = (
        data.groupby(
            ["store_nbr", "family"]
        )["sales"].shift(-horizon)
    )

    # Check whether target date was an original observation
    data["target_observed"] = (
        data.groupby(
            ["store_nbr", "family"]
        )["observed"].shift(-horizon)
    )

    # Calculate the future target date
    data["target_date"] = (
        data["date"] + pd.Timedelta(days=horizon)
    )

    # Calendar information for the target date
    data["target_dayofweek"] = (
        data["target_date"].dt.dayofweek
    )

    data["target_month"] = (
        data["target_date"].dt.month
    )

    data["target_day"] = (
        data["target_date"].dt.day
    )

    data["target_is_weekend"] = (
        data["target_dayofweek"].isin([5, 6]).astype(int)
    )

    # Keep only:
    # 1. Original forecast-origin observations
    # 2. Targets that were actually observed
    # 3. Rows with complete historical features

    model_data = data[
        (data["observed"] == True)
        & (data["target_observed"] == True)
    ].copy()

    model_data = model_data.dropna(
        subset=[
            "lag_1",
            "lag_2",
            "lag_3",
            "lag_7",
            "lag_14",
            "rolling_mean_7",
            "rolling_mean_14",
            "target"
        ]
    )

    final_columns = (
        ["date", "target_date", "target"]
        + feature_columns
        + [
            "target_dayofweek",
            "target_month",
            "target_day",
            "target_is_weekend"
        ]
    )

    model_data = model_data[final_columns]

    output_file = (
        OUTPUT_PATH
        / f"forecast_day_{horizon}.pkl"
    )

    model_data.to_pickle(output_file)

    print("Forecast horizon:", horizon, "day(s)")
    print("Dataset shape:", model_data.shape)
    print("Saved:", output_file)

# ==========================================
# 8. FINAL VERIFICATION
# ==========================================

print("\n========== FEATURE ENGINEERING COMPLETED ==========")

print("Original records:", len(df))
print("Complete calendar records:", len(history))

print(
    "Inserted dates:",
    (~history["observed"]).sum()
)

print(
    "All 14 food families retained:",
    history["family"].nunique() == 14
)

print(
    "All 54 stores retained:",
    history["store_nbr"].nunique() == 54
)
