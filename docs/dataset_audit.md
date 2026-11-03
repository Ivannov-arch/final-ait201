# Dataset Problem Report
> Documents issues found in each dataset against the AI instruction specifications. No changes have been made to any file.

---

## Step 7 — Inventory Management

### `7. Grocery_Inventory new v1.csv`
**Expected columns:** `Product_ID, Category, Stock_Quantity, Reorder_Level, Date_Received, Expiration_Date, Sales_Volume, Inventory_Turnover_Rate, Status`

#### ❌ Problem 1 — Column Typo
- The column `Category` is misspelled as **`Catagory`** in the file header. Every downstream step that references `Category` by name will fail or produce a mismatch.

#### ❌ Problem 2 — 1 Null Value in `Catagory`
- **Row 574** — Product: **Cabbage**, Supplier: Rooxo, Status: Discontinued
- The `Catagory` field for this row is `NaN`. This product has no category label, which means it cannot be grouped or routed by category in any downstream step (FEFO logic, waste-risk scoring, etc.).
- All other fields for this row are populated.

---

### `7. perishable_goods_management.csv`
✅ No problems found. All 42 columns present, 100,000 rows, zero null values.

---

## Step 8 — Demand Forecasting

### `8. store-sales-time-series-forecasting/` — Folder as a Whole
**Expected columns:** `date, store_nbr, item_id, sales, onpromotion, sell_price, city, state, holiday, oil_price`

When all files in the folder are considered together (`train.csv`, `stores.csv`, `oil.csv`, `holidays_events.csv`, `transactions.csv`), the coverage is as follows:

| Required Column | Found In | Status |
|---|---|---|
| `date` | `train.csv` | ✅ |
| `store_nbr` | `train.csv` | ✅ |
| `item_id` | `train.csv` as `id` | ⚠️ See Problem 1 |
| `sales` | `train.csv` | ✅ |
| `onpromotion` | `train.csv` | ✅ |
| `sell_price` | Nowhere in the folder | ❌ See Problem 2 |
| `city` | `stores.csv` (join via `store_nbr`) | ✅ |
| `state` | `stores.csv` (join via `store_nbr`) | ✅ |
| `holiday` | `holidays_events.csv` (join via `date`) | ✅ |
| `oil_price` | `oil.csv` as `dcoilwtico` (join via `date`) | ✅ |

#### ⚠️ Problem 1 — `item_id` Column Name Differs
- `train.csv` has a column named **`id`**, but it is a **sequential row counter** (0, 1, 2, 3…), not a product identifier. The actual product grouping is done by the **`family`** column (e.g. `AUTOMOTIVE`, `DAIRY`, `BREAD/BAKERY`), which represents broad product categories, not individual item IDs. There is no SKU-level item identifier in this dataset.

#### ❌ Problem 2 — `sell_price` Is Absent From the Entire Folder
- No file in the `8. store-sales-time-series-forecasting/` folder contains a `sell_price` or unit price column. The `sales` column in `train.csv` represents **units sold** (transaction volume), not a monetary price. In my opinion, `sales` here is a **quantity/count measure**, not a price — it does not substitute for `sell_price`. The M5 Walmart competition has a separate `sell_prices.csv` file, but the Favorita version used here has no equivalent.

#### ⚠️ Problem 3 — Geography Mismatch
- The entire folder is based on **Ecuador** (Favorita supermarket chain). Cities, states, holidays, and consumer patterns do not reflect Malaysia. The AI instruction acknowledges this is for shape/pattern calibration only.

---

### `8. store-sales-time-series-forecasting/oil.csv`
> [!NOTE]
> The 43 missing values in `dcoilwtico` occur on **public holidays** when commodity markets are closed and no price is recorded. This is expected behaviour for this dataset, not a data quality error.

---

### `8. store-sales-time-series-forecasting/holidays_events.csv`

#### ❌ Problem — Geography Mismatch
- All holidays are for **Ecuador** (`locale_name` values: Quito, Guayaquil, Manta, etc.). None are Malaysian. Using this file directly as a Malaysian holiday calendar would be incorrect.

---

### `8. store-sales-time-series-forecasting/stores.csv`
✅ No null values. 54 stores fully described. Geography mismatch with Ecuador applies (same as above).

### `8. store-sales-time-series-forecasting/transactions.csv`
✅ No problems found. 83,488 rows, zero nulls.

---

### `8. archive/retail_sales_forecast_dataset.csv`
**Expected columns:** `Date, Store_ID, Product_ID, Units_Sold, Inventory_Level, Discount_Percent, Promotion, Holiday, Weather_Condition`

✅ All 9 required columns are present. 25,000 rows, zero null values. No problems found.

---

## Step 11 — Surplus / Waste-Risk Scoring

### `11. food_waste_ml_1000.csv`

#### ❌ Problem 1 — `Category` Column Is Missing (Replaced by Encoded Integer)
- The required `category` column does not exist. In its place is **`product_encoded`**, an integer from 0–7 representing 8 product types. The original category string labels have been removed from this file entirely.
- There is **no mapping table** included in this file to decode what categories 0–7 represent. Category-level filtering, grouping, or reporting is not possible without an external lookup.

#### ❌ Problem 2 — All Numeric Features Are Min-Max Normalized
- The columns `quantity`, `price`, `expiry_days`, and `temperature` all have values in the range `[0.0, 1.0]`. These are **not real-world units** — they are scaled ML features.
  - `quantity`: range 0.000 – 1.000 (not actual unit counts)
  - `price`: range 0.000 – 1.000 (not actual RM values)
  - `expiry_days`: range 0.000 – 1.000 (not actual days remaining)
  - `temperature`: range 0.000 – 1.000 (not actual °C)
- The original unscaled values are not recoverable from this file without the original scaler parameters.

#### ❌ Problem 3 — Small Dataset Size
- Only **1,000 rows**, which is very limited for training a robust waste-risk classifier across multiple categories, business types, and seasonal patterns.

---

### `11. archive/food_waste_dataset.csv`

#### ❌ Problem — 5 Columns With Missing Values
Missing values are spread across all 4 business types (Restaurant, Supermarket, Cafeteria, Cloud Kitchen) and all 6 food categories (Fruits, Vegetables, Bakery, Dairy, Meat, Prepared Food). The nulls do not appear isolated to one subset — they are distributed throughout the dataset.

| Column | Null Count | % of 8,000 rows |
|---|---|---|
| `Shelf_Life_Days` | 235 | 2.94% |
| `Donation_Made` | 233 | 2.91% |
| `Daily_Demand` | 210 | 2.63% |
| `Weather` | 203 | 2.54% |
| `Storage_Temperature` | 186 | 2.33% |

**Breakdown of `Shelf_Life_Days` nulls by type:**
- By Business Type: Restaurant (78), Supermarket (77), Cafeteria (48), Cloud Kitchen (32)
- By Food Category: Prepared Food (49), Fruits (44), Vegetables (44), Bakery (36), Dairy (36), Meat (26)

**Breakdown of `Storage_Temperature` nulls by type:**
- By Business Type: Supermarket (58), Restaurant (53), Cloud Kitchen (39), Cafeteria (36)
- By Food Category: Fruits (44), Prepared Food (33), Dairy (29), Meat (27), Bakery (27), Vegetables (26)

**Breakdown of `Daily_Demand` nulls by type:**
- By Business Type: Supermarket (69), Restaurant (52), Cloud Kitchen (49), Cafeteria (40)
- By Food Category: Fruits (53), Vegetables (45), Prepared Food (32), Meat (28), Bakery (27), Dairy (25)

**Breakdown of `Weather` nulls by type:**
- By Business Type: Supermarket (68), Restaurant (62), Cafeteria (43), Cloud Kitchen (30)
- By Food Category: Vegetables (39), Fruits (38), Prepared Food (36), Dairy (33), Bakery (32), Meat (25)

**Breakdown of `Donation_Made` nulls by type:**
- By Business Type: Restaurant (77), Supermarket (75), Cafeteria (45), Cloud Kitchen (36)
- By Food Category: Fruits (43), Meat (43), Bakery (41), Prepared Food (40), Vegetables (39), Dairy (27)

> [!NOTE]
> The dataset's own `data_dictionary.csv` (in the same archive folder) acknowledges these missing values under the `Approx_Missing_Pct` column — confirming they are a known characteristic of the dataset, not a loading error.

---

### `11. pricecatcher_2026-10.csv`
✅ All 4 required columns present (`date, premise_code, item_code, price`). 1,279,987 rows, zero nulls.

#### ⚠️ Limitation — Codes Only, No Human-Readable Labels
- `premise_code` and `item_code` are **numeric codes**, not names. The file contains no lookup/reference table for what item or premise each code refers to. Without the DOSM companion lookup tables, it is not possible to map prices to product categories or store names.

---

## Summary of All Problems

| File | Problem | Severity |
|---|---|---|
| `7. Grocery_Inventory new v1.csv` | Column name `Catagory` is misspelled | 🔴 High |
| `7. Grocery_Inventory new v1.csv` | 1 null in `Catagory` (Row 574 — Cabbage) | 🟡 Medium |
| `8. folder (train.csv)` | `id` column is a row counter, not a meaningful item ID — `family` is the product grouping | ⚠️ Note |
| `8. folder` | `sell_price` is absent from every file in the folder | 🔴 High |
| `8. folder` | Ecuador-based data (Favorita) — cities, states, holidays do not reflect Malaysia | 🟡 Medium |
| `8. oil.csv` | 43 missing values in `dcoilwtico` occur on public holidays — expected behaviour | ℹ️ Info |
| `11. food_waste_ml_1000.csv` | `category` column absent; replaced by integer `product_encoded` with no mapping | 🔴 High |
| `11. food_waste_ml_1000.csv` | All numeric features are min-max scaled `[0,1]` — not real-world units | 🔴 High |
| `11. food_waste_ml_1000.csv` | Only 1,000 rows — very small dataset | 🟡 Medium |
| `11. archive/food_waste_dataset.csv` | 5 columns with ~2.3–2.9% null values each (total ~1,067 missing cells) | 🟡 Medium |
| `11. pricecatcher_2026-10.csv` | `premise_code` and `item_code` are numeric codes — no name lookup table included | 🟠 Low-Medium |
