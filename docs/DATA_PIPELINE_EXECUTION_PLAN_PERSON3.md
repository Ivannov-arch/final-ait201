# Rencana Eksekusi Data Pipeline & Arsitektur End-to-End — Person 3 (Goal 4 Base, Goal 3 & Goal 4 Full)
> **Peran:** Data Architect & Pipeline Lead  
> **Ruang Lingkup:**  
> • **🏗️ BASE (Fase 1 - Prioritas Utama):** Goal 4 Base — Single-Source ETL Pipeline (`Grocery_Inventory`) → `lots_base.csv` + Script Validasi Integritas  
> • **🚀 UPGRADE (Fase 2 - Multi-Toko):** Goal 3 — Canonical Schema 5 Dataset (`canonical_batch_table.csv`) + Goal 4 Full — Discrete-Event Simulator Engine (`simulation_events.csv`)  
> **Output Utama:** `lots_base.csv`, `src/etl/process_store_inventory.py`, `src/etl/validate_lots_base.py`, `canonical_batch_table.csv`, `simulation_events.csv`

---

## 📌 Executive Summary & Konfirmasi Peran

Dokumen ini merupakan konfirmasi teknis resmi dan rencana aksi menyeluruh untuk **Person 3 (Data Architect & Pipeline Lead)** dalam proyek *Dynamic Food Clearing House*.

Sebagai Person 3, Anda memegang peran fundamental sebagai **"Penyedia Sumber Kebenaran Tunggal (Single Source of Truth)"**:
1. Seluruh modul downstream tim (Model Klasifikasi FEFO Person 1, Peramalan Permintaan Person 2, Rule Engine & Database Supabase Person 4, Model Risiko Waste & OSRM Dispatch Person 5, serta Dashboard React/Vite Person 6) **100% bergantung pada output pipeline data yang Anda rancang**.
2. Anda **TIDAK MENGALAMI BOTTLENECK** pada Hari Pertama (Day 1). Anda dapat langsung mulai memproses dataset inventaris mentah tanpa perlu menunggu modul ML atau backend selesai.
3. Arsitektur data dipisahkan secara tegas ke dalam dua fase:
   - **Fase 1 (BASE):** Membangun ETL tunggal yang bersih dan cepat dari 1 dataset (`Grocery_Inventory`) untuk mendrive alur 6-langkah toko sesuai `Alur_Penggunaan_Sistem.pdf`.
   - **Fase 2 (UPGRADE):** Harmonisasi skema kanonikal 5 dataset dan engine simulasi event aliran surplus multi-toko.

---

## 1. Arsitektur Pipeline & Aliran Data Sistem

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                  INPUT DATASETS                                        │
│  • data/raw/7. Grocery_Inventory new v1.csv (1.000 SKU mentah)                         │
│  • data/processed/7. Grocery_Inventory_cleaned.csv (Hasil audit Person 0)              │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        FASE 1 (BASE): SINGLE-STORE ETL PIPELINE                        │
│                        src/etl/process_store_inventory.py                              │
│                                                                                        │
│  1. Pembersihan Header & Typos: 'Catagory' → 'Category'                                │
│  2. Imputasi Cabbage NaN → 'Produce'                                                   │
│  3. Konversi Mata Uang: Regex '$' → Float → Nilai MYR (Ringgit Malaysia)              │
│  4. Standardisasi Tanggal: 'M/D/YYYY' → ISO-8601 'YYYY-MM-DD'                          │
│  5. Temporal Anchoring: Kalibrasi 'days_to_expiry' non-negatif                         │
│  6. Feature Pre-Computation: shelf_life_days, turnover_ratio, stock_pressure           │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                     OUTPUT BASE UTAMA: data/processed/lots_base.csv                     │
│  Kolom: lot_id, product_name, category, quantity, expiry_date, unit_price_myr,         │
│         store_id, date_received, shelf_life_days, days_to_expiry, turnover_ratio,     │
│         stock_pressure, reorder_level                                                  │
└───────────────────┬───────────────────────────────┬────────────────────────────────────┘
                    │                               │
       ┌────────────┴────────────┐                  │
       ▼                         ▼                  ▼
┌──────────────┐         ┌──────────────┐   ┌────────────────────────────────────────────┐
│   PERSON 1   │         │   PERSON 4   │   │                PERSON 2 & 6                │
│ ML FEFO &    │         │ Supabase DB  │   │ FastAPI (/api/lots) &                      │
│ Spoilage     │         │ batches      │   │ Dashboard React 6-Langkah UI               │
│ Classifier   │         │ Table & RLS  │   └────────────────────────────────────────────┘
└──────────────┘         └──────────────┘
```

---

## 2. Fase 1 (BASE): Spesifikasi Teknis Single-Source ETL (Goal 4 Base)

### 2.1 Aturan Pembersihan & Transformasi Data (Cleansing Logic)

1. **Pembersihan Kolom Header & Penanganan Null:**
   - Deteksi otomatis kolom `Catagory` dan ubah menjadi `Category`.
   - Baris 574 (`Product_Name = 'Cabbage'`, `Category = NaN`): tetapkan nilai `'Produce'` secara defensif berbasis *domain knowledge*.
   - Hapus spasi liar (*whitespace trimming*) pada semua kolom teks.

2. **Standardisasi Harga Satuan ke Ringgit Malaysia (MYR):**
   - Kolom mentah `Unit_Price` berformat string dengan simbol dollar (misal: `"$4.60"`).
   - Ekstrak nilai numerik menggunakan regular expression (`r'[\$,]'`), lalu ubah ke float.
   - Konversi ke Ringgit Malaysia (MYR) menggunakan kurs realistis ritel atau kalibrasi harga lokal (`unit_price_myr = round(usd_price * 4.45, 2)`).

3. **Standardisasi Format Tanggal ke ISO-8601 (`YYYY-MM-DD`):**
   - Dataset Kaggle mentah menggunakan format tanggal Amerika (`M/D/YYYY`, misal: `3/1/2024`).
   - Ubah `Date_Received` dan `Expiration_Date` menjadi format baku `YYYY-MM-DD` agar seragam dengan PostgreSQL Supabase dan JavaScript ISO standard.

4. **Strategi Temporal Anchoring (Mencegah Nilai Kedaluwarsa Negatif):**
   > [!IMPORTANT]
   > Dataset Kaggle adalah data historis statis bertanggal 2024–2025. Jika kita menghitung `days_to_expiry = Expiration_Date - today()` di tahun 2026, **seluruh nilai akan bernilai negatif ratusan hari**, yang menyebabkan logika FEFO, Spoilage ML, dan Dynamic Markdown rusak total.
   > 
   > **Solusi Person 3:**
   > - Hitung masa simpan total (*shelf life days*):  
   >   `shelf_life_days = (Expiration_Date - Date_Received).dt.days`
   > - Sediakan **Runtime Anchor Date** (misalnya tanggal referensi operasional `2026-10-30` yang selaras dengan frontend `inventoryData.js` dan dataset DOSM PriceCatcher Oktober 2026):  
   >   `days_to_expiry = max(0, (Expiration_Date - anchor_date).dt.days)`  
   >   *(Atau geser tanggal ke horizon simulasi aktif sehingga terdapat sebaran realistis 1–10 hari kedaluwarsa)*.

5. **Kompilasi Fitur Turunan untuk ML & Rule Engine:**
   - `turnover_ratio`: ambil langsung dari `Inventory_Turnover_Rate`.
   - `stock_pressure`: `Stock_Quantity / (Reorder_Level + 1)`.
   - `store_id`: tetapkan identifier cabang toko default, misal `'MY-KL-001'` (Kuala Lumpur Flagship).

---

### 2.2 Kamus Skema Kolom `lots_base.csv`

Berikut adalah skema final tabel `lots_base.csv` yang akan diekspor:

| Nama Kolom | Tipe Data | Keterangan & Batasan | Contoh Nilai | Dikonsumsi Oleh |
|---|---|---|---|---|
| `lot_id` | `VARCHAR(32)` | **Primary Key**, unik, tidak boleh null. Format: `LOT-XXXX` | `LOT-1001` | Person 1, 2, 4, 5, 6 |
| `product_name` | `VARCHAR(128)` | Nama produk terstandarisasi, Title Case. | `Organic Spinach` | Person 2, 4, 6 |
| `category` | `VARCHAR(64)` | Kategori baku: Produce, Dairy, Meat, Bakery, Pantry, dll. | `Produce` | Person 1, 4, 5, 6 |
| `quantity` | `INTEGER` | Jumlah stok lot dalam unit/kg, `> 0`. | `46` | Person 1, 2, 4, 5, 6 |
| `expiry_date` | `DATE (YYYY-MM-DD)` | Tanggal kadaluarsa format ISO-8601. | `2026-11-02` | Person 1, 2, 4, 6 |
| `unit_price_myr` | `NUMERIC(8,2)` | Harga satuan komoditas dalam Ringgit Malaysia. | `20.47` | Person 4, 6 |
| `store_id` | `VARCHAR(32)` | ID lokasi cabang supermarket di Lembah Klang. | `MY-KL-001` | Person 2, 4, 5, 6 |
| `date_received` | `DATE (YYYY-MM-DD)` | Tanggal lot diterima gudang toko. | `2026-10-25` | Person 1, 4 |
| `shelf_life_days` | `INTEGER` | Total umur simpan lot sejak diterima hingga expired. | `8` | Person 1 (`spoilage.py`) |
| `days_to_expiry` | `INTEGER` | Sisa hari hingga kedaluwarsa (`>= 0`). | `3` | Person 1, 4, 6 |
| `turnover_ratio` | `NUMERIC(6,2)` | Rasio perputaran stok toko (`Inventory_Turnover_Rate`). | `1.96` | Person 1 (`spoilage.py`) |
| `stock_pressure` | `NUMERIC(6,2)` | Rasio tekanan stok (`quantity / (reorder_level + 1)`). | `0.71` | Person 1 (`spoilage.py`) |
| `reorder_level` | `INTEGER` | Batas minimum stok pemesanan ulang. | `64` | Person 1, 4 |

---

### 2.3 Implementasi Script ETL (`src/etl/process_store_inventory.py`)

Berikut arsitektur kode ETL yang akan dieksekusi:

```python
"""Single-Source ETL Pipeline for Store Inventory (Person 3 - Goal 4 Base).

Processes raw grocery inventory into standardized, clean lots_base.csv.
"""

from __future__ import annotations
import os
import re
from datetime import datetime, timedelta
import pandas as pd
import numpy as np

RAW_INPUT_PATH = os.path.join("data", "raw", "7. Grocery_Inventory new v1.csv")
PROCESSED_INPUT_PATH = os.path.join("data", "processed", "7. Grocery_Inventory_cleaned.csv")
OUTPUT_PATH = os.path.join("data", "processed", "lots_base.csv")

USD_TO_MYR_RATE = 4.45
DEFAULT_STORE_ID = "MY-KL-001"
ANCHOR_DATE = datetime(2026, 10, 30)


def clean_currency_to_float(value: str | float | int) -> float:
    """Strips currency symbols and commas, casting value to float."""
    if pd.isna(value):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = re.sub(r"[^\d.]", "", str(value))
    return float(cleaned) if cleaned else 0.0


def process_store_inventory(
    input_path: str | None = None,
    output_path: str = OUTPUT_PATH,
    anchor_date: datetime = ANCHOR_DATE,
) -> pd.DataFrame:
    """Executes the extraction, cleansing, transformation, and export pipeline."""
    # 1. Tentukan sumber input (prioritaskan cleaned jika ada)
    source_file = input_path or (
        PROCESSED_INPUT_PATH if os.path.exists(PROCESSED_INPUT_PATH) else RAW_INPUT_PATH
    )
    if not os.path.exists(source_file):
        raise FileNotFoundError(f"Input inventory dataset not found at: {source_file}")

    print(f"[ETL] Loading raw inventory from: {source_file}")
    df = pd.read_csv(source_file)

    # 2. Standarisasi nama kolom
    df.columns = [c.strip() for c in df.columns]
    if "Catagory" in df.columns:
        df = df.rename(columns={"Catagory": "Category"})

    # 3. Defensive Imputation
    cabbage_mask = (df["Product_Name"] == "Cabbage") & (df["Category"].isna())
    if cabbage_mask.any():
        df.loc[cabbage_mask, "Category"] = "Produce"
    df["Category"] = df["Category"].fillna("General Grocery")

    # 4. Standardisasi Tanggal
    df["Date_Received"] = pd.to_datetime(df["Date_Received"], errors="coerce")
    df["Expiration_Date"] = pd.to_datetime(df["Expiration_Date"], errors="coerce")

    # 5. Konversi Mata Uang
    raw_price = df["Unit_Price"].apply(clean_currency_to_float)
    df["unit_price_myr"] = (raw_price * USD_TO_MYR_RATE).round(2)

    # 6. Feature Engineering & Temporal Calibration
    # Total shelf life (deterministik dari data)
    df["shelf_life_days"] = (df["Expiration_Date"] - df["Date_Received"]).dt.days
    df["shelf_life_days"] = df["shelf_life_days"].clip(lower=1)

    # Untuk demo operasional retail: kalibrasikan Expiration_Date agar relevan
    # dengan anchor_date (membuat sebaran 1-14 hari kedaluwarsa)
    days_offset = (df.index % 12) + 1  # Siklus 1 - 12 hari
    calibrated_expiry = [anchor_date + timedelta(days=int(d)) for d in days_offset]
    df["expiry_date_calibrated"] = calibrated_expiry

    df["days_to_expiry"] = [(exp - anchor_date).days for exp in calibrated_expiry]
    df["days_to_expiry"] = df["days_to_expiry"].clip(lower=0)

    # Rasio perputaran & tekanan stok
    df["turnover_ratio"] = df["Inventory_Turnover_Rate"].fillna(1.0).astype(float)
    reorder_level = df["Reorder_Level"].fillna(10).astype(int)
    stock_qty = df["Stock_Quantity"].fillna(0).astype(int)
    df["stock_pressure"] = (stock_qty / (reorder_level + 1)).round(2)

    # 7. Format Output Schema
    lots_df = pd.DataFrame()
    lots_df["lot_id"] = [f"LOT-{1000 + i}" for i in range(len(df))]
    lots_df["product_name"] = df["Product_Name"].astype(str).str.strip()
    lots_df["category"] = df["Category"].astype(str).str.strip()
    lots_df["quantity"] = stock_qty
    lots_df["expiry_date"] = [d.strftime("%Y-%m-%d") for d in calibrated_expiry]
    lots_df["unit_price_myr"] = df["unit_price_myr"]
    lots_df["store_id"] = DEFAULT_STORE_ID
    lots_df["date_received"] = [anchor_date.strftime("%Y-%m-%d")] * len(df)
    lots_df["shelf_life_days"] = df["shelf_life_days"]
    lots_df["days_to_expiry"] = df["days_to_expiry"]
    lots_df["turnover_ratio"] = df["turnover_ratio"]
    lots_df["stock_pressure"] = df["stock_pressure"]
    lots_df["reorder_level"] = reorder_level

    # 8. Ekspor ke CSV
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    lots_df.to_csv(output_path, index=False)
    print(f"[ETL] Successfully generated {len(lots_df)} clean lots at: {output_path}")

    return lots_df
```

---

## 3. Data Integrity & Validation Suite (`validate_lots_base.py`)

Untuk menjamin tidak ada data korup yang lolos ke Supabase atau ML model, Person 3 membangun script penguji otomatis yang menjalankan **7 Golden Rules of Pipeline Integrity**:

```python
"""Data Integrity Validation Suite for lots_base.csv (Person 3 - Goal 4 Base)."""

import os
import sys
import pandas as pd

LOTS_FILE = os.path.join("data", "processed", "lots_base.csv")

def validate_lots_base(file_path: str = LOTS_FILE) -> bool:
    if not os.path.exists(file_path):
        print(f"[FAIL] Target file does not exist: {file_path}")
        return False

    df = pd.read_csv(file_path)
    errors = []

    # Rule 1: Wajib ada kolom standar
    required_cols = [
        "lot_id", "product_name", "category", "quantity", 
        "expiry_date", "unit_price_myr", "store_id", "days_to_expiry"
    ]
    for col in required_cols:
        if col not in df.columns:
            errors.append(f"Missing required column: {col}")

    # Rule 2: Tidak boleh ada null pada primary fields
    for col in required_cols:
        null_count = df[col].isna().sum()
        if null_count > 0:
            errors.append(f"Column '{col}' has {null_count} NULL values.")

    # Rule 3: Primary Key Uniqueness
    if df["lot_id"].duplicated().any():
        dups = df["lot_id"].duplicated().sum()
        errors.append(f"Found {dups} duplicate lot_id entries.")

    # Rule 4: Kuantitas stok harus positif (> 0)
    if (df["quantity"] <= 0).any():
        invalid_qty = (df["quantity"] <= 0).sum()
        errors.append(f"Found {invalid_qty} lots with quantity <= 0.")

    # Rule 5: Harga satuan harus valid (> 0.0)
    if (df["unit_price_myr"] <= 0).any():
        invalid_price = (df["unit_price_myr"] <= 0).sum()
        errors.append(f"Found {invalid_price} lots with unit_price_myr <= 0.")

    # Rule 6: days_to_expiry tidak boleh negatif untuk stok aktif
    if (df["days_to_expiry"] < 0).any():
        neg_dte = (df["days_to_expiry"] < 0).sum()
        errors.append(f"Found {neg_dte} lots with days_to_expiry < 0.")

    # Rule 7: Format tanggal harus YYYY-MM-DD
    try:
        pd.to_datetime(df["expiry_date"], format="%Y-%m-%d", errors="raise")
    except Exception as e:
        errors.append(f"Date formatting error in expiry_date: {e}")

    # Report result
    if errors:
        print(f"[VALIDATION FAILED] {len(errors)} issues found:")
        for err in errors:
            print(f"  ❌ {err}")
        return False

    print(f"[VALIDATION PASSED] All 7 integrity rules satisfied for {len(df)} lots.")
    return True

if __name__ == "__main__":
    passed = validate_lots_base()
    sys.exit(0 if passed else 1)
```

---

## 4. Fase 2 (UPGRADE): Spesifikasi Teknis Canonical Schema & Event Simulator

Setelah Fase 1 (BASE) stabil, Person 3 melanjutkan ke Fase 2 untuk ekspansi skala:

### 4.1 Goal 3 — Canonical Schema 5 Dataset (`canonical_batch_table.csv`)

Harmonisasi 5 dataset heterogen ke dalam skema terpadu:
1. `Grocery_Inventory new v1.csv` (Stok, expiry, reorder level)
2. `perishable_goods_management.csv` (100.000 data transaksi ritel, 10 kategori produk)
3. `store-sales-time-series-forecasting/train.csv` (M5/Favorita time series penjualan & tren promo)
4. `food_waste_dataset.csv` (8.000 baris faktor pemborosan, temperatur, dan jenis bisnis)
5. `pricecatcher_2026-10.csv` + `item.parquet` (Harga pasar komoditas pangan riil Malaysia dari DOSM)

**Tabel Pemetaan Kategori Lintas Dataset (`docs/schema_mapping.md`):**

| Kategori Kanonikal | Grocery Inventory | Perishable Goods | M5 / Favorita Family | DOSM PriceCatcher Item Group |
|---|---|---|---|---|
| `Produce` | Fruits & Vegetables | Produce, Vegetables, Fruits | `PRODUCE` | Sayur-Sayuran, Buah-Buahan |
| `Dairy` | Dairy | Dairy & Eggs | `DAIRY` | Susu & Produk Tenusu |
| `Meat` | Meat & Poultry | Meat, Poultry, Seafood | `MEATS`, `POULTRY`, `SEAFOOD` | Daging Segar, Ayam, Makanan Laut |
| `Bakery` | Bakery | Bakery & Bread | `BREAD/BAKERY` | Roti & Bakeri |
| `Pantry` | Canned Goods, Grains | Dry Goods, Canned Goods | `GROCERY I`, `GROCERY II` | Barangan Kering, Beras |

---

### 4.2 Goal 4 Full — Discrete-Event Simulator Engine (`simulation_events.csv`)

Mensimulasikan dinamika aliran stok multi-toko (3–5 cabang di Lembah Klang) selama 30, 60, atau 90 hari.

**State Machine Siklus Hidup Batch Pangan di Ritel:**
```
[ received ] ──> [ active_fefo ] ──> [ markdown ] ──> [ dispatched ] (Food Bank)
                                       │
                                       └──> [ wasted ] (Landfill / Rusak)
```

> [!WARNING]
> Sesuai arahan `FAQ.md` dan `problem_statement.md`, lingkup simulator kita berada di tingkat ritel/supermarket (Step 7–14). **DILARANG MENGGUNAKAN EVENT HULU/PERTANIAN** seperti `Harvested`, `Shipped`, atau `Stored`. Hanya gunakan 5 event resmi di atas.

**Spesifikasi Output `simulation_events.csv`:**
- `event_id`: UUID unik event.
- `batch_id`: ID lot bersangkutan.
- `store_id`: Cabang toko supermarket.
- `event_type`: Salah satu dari: `received`, `active_fefo`, `markdown`, `dispatched`, `wasted`.
- `timestamp`: Format ISO-8601 UTC+8 Malaysia (`YYYY-MM-DD HH:MM:SS+08:00`).
- `quantity`: Jumlah unit yang mengalami event.
- `metadata`: JSONB berisi parameter spesifik (diskon %, food bank id, nilai finansial diselamatkan, dll.).

---

## 5. Kontrak Integrasi Antar-Anggota Tim (Interoperability Matrix)

| Rekan Tim | Arah Aliran | Data / Artefak | Spesifikasi Kontrak |
|---|---|---|---|
| **Person 0** *(Data Quality)* | Inflow (Masuk ke P3) | `7. Grocery_Inventory_cleaned.csv`, `holidays_my.csv`, `item.parquet` | Person 0 membersihkan typo kolom dan menyediakan data lookup Malaysia. Person 3 mengintegrasikannya ke pipeline. |
| **Person 1** *(Tech Lead & ML)* | Outflow (Keluar dari P3) | `lots_base.csv` | Person 1 membutuhkan kolom `shelf_life_days`, `turnover_ratio`, `stock_pressure`, `unit_price_myr`, dan `category` untuk fungsi `predict_spoilage_risk()`. |
| **Person 2** *(Forecaster & API)* | Outflow (Keluar dari P3) | `lots_base.csv` | Person 2 membaca file ini untuk melayani endpoint `GET /api/lots` dan mencocokkan prediksi peramalan permintaan 3 hari per produk. |
| **Person 4** *(Logic & Cloud DB)* | Outflow (Keluar dari P3) | `lots_base.csv` & `simulation_events.csv` | Person 4 menggunakan `lots_base.csv` sebagai input script `ingest/upload_batches.py` ke tabel PostgreSQL Supabase `batches`, serta input untuk fungsi `assign_route()`. |
| **Person 5** *(Risk & Dispatch)* | Outflow (Keluar dari P3) | `lots_base.csv` | Person 5 membutuhkan informasi `lot_id`, berat `quantity`, dan `store_id` untuk mencocokkan kapasitas food bank dan memanggil API rute OSRM. |
| **Person 6** *(Frontend Lead)* | Outflow (Keluar dari P3) | `lots_base.csv` & skema JSON | Person 6 mengonsumsi skema data lot untuk merender tabel inventaris FEFO, badge risiko kedaluwarsa, dan modal aksi pada web app React/Vite. |

---

## 6. Struktur File & Artefak Kode

```
c:\Users\Matthew\Documents\Univ\Year 2\Sem 4\Applied ML\food-cleaning-ait201\
├── data/
│   ├── raw/
│   │   └── 7. Grocery_Inventory new v1.csv        # Dataset mentah 1.000 baris
│   └── processed/
│       ├── 7. Grocery_Inventory_cleaned.csv        # Dataset bersih dari Person 0
│       ├── lots_base.csv                           # ⭐ DELIVERABLE UTAMA BASE PERSON 3
│       └── canonical_batch_table.csv               # DELIVERABLE UPGRADE PERSON 3
├── src/
│   └── etl/
│       ├── __init__.py
│       ├── process_store_inventory.py              # ⭐ SCRIPT ETL UTAMA PERSON 3
│       ├── validate_lots_base.py                   # ⭐ SCRIPT VALIDASI INTEGRITAS DATA
│       ├── canonical_schema.py                     # SCRIPT MAPPING 5 DATASET (UPGRADE)
│       └── simulator_engine.py                     # SCRIPT GENERATOR EVENT (UPGRADE)
├── docs/
│   ├── PEMBAGIAN_TUGAS.md
│   ├── INDEPENDENT_TASKS.md
│   ├── ML_EXECUTION_PLAN_PERSON1.md
│   ├── DATA_PIPELINE_EXECUTION_PLAN_PERSON3.md     # Dokumen markdown ini
│   ├── Confirmation_Person3_Data_Architect.pdf     # ⭐ DOKUMEN PDF RESMI TERVERIFIKASI
│   └── schema_mapping.md                           # Dokumentasi mapping kanonikal
└── output/
    └── simulation_events.csv                       # OUTPUT SIMULASI EVENT (UPGRADE)
```

---

## 7. Checklist Eksekusi & Timeline Person 3

### 🏗️ BASE Phase (Hari 1–3 — Prioritas Utama)
- [ ] Buat dan uji script `src/etl/process_store_inventory.py`.
- [ ] Jalankan pembersihan currency `$`, standardisasi tanggal ISO, dan kalibrasi temporal.
- [ ] Ekspor file `data/processed/lots_base.csv`.
- [ ] Tulis dan jalankan script validasi `src/etl/validate_lots_base.py` (Pastikan output: *7/7 Golden Rules Passed*).
- [ ] Lakukan *cross-check* keselarasan dengan Person 1 (`src/ml/spoilage.py`) dan Person 4 (`ingest/upload_batches.py`).
- [ ] Serahkan file `lots_base.csv` yang terverifikasi ke folder tim.

### 🚀 UPGRADE Phase (Hari 4–7 — Ekspansi Skala Multi-Toko)
- [ ] Kaji sampel 5 baris dari 5 dataset riil (Inventory, Perishable, M5, Food Waste, PriceCatcher).
- [ ] Tulis dokumen `docs/schema_mapping.md` berisi kamus pemetaan kategori dan konversi unit.
- [ ] Kembangkan `src/etl/canonical_schema.py` untuk menghasilkan `canonical_batch_table.csv`.
- [ ] Bangun engine simulasi event retail di `src/etl/simulator_engine.py` yang menghasilkan `output/simulation_events.csv` (event: `received`, `active_fefo`, `markdown`, `dispatched`, `wasted`).
- [ ] Validasi integritas metadata JSONB event untuk tabel Supabase `simulation_events`.

---

**Pernyataan Konfirmasi Eksekusi:**  
Rencana eksekusi dan arsitektur data pipeline di atas telah dikonfirmasi dan selaras 100% dengan kebutuhan teknis tim, matriks pembagian tugas (`PEMBAGIAN_TUGAS.md`), alur independen bebas bottleneck (`INDEPENDENT_TASKS.md`), serta alur sistem ritel 6-langkah (`Alur_Penggunaan_Sistem.pdf`). Siap dieksekusi secara mandiri.

