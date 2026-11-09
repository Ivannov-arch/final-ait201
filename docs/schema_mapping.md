# Schema Mapping & Data Harmonization Specification — Goal 3 (Person 3)
> **Dokumen Resmi Pemetaan Skema Kanonikal (Cross-Dataset Harmonization)**  
> Proyek: *Dynamic Food Clearing House Simulator (AIT-201)*  
> Penanggung Jawab: **Person 3 — Data Architect & Pipeline Lead**  
> Output: `canonical_batch_table.csv` + `src/etl/canonical_schema.py`

---

## 1. Pendahuluan & Latar Belakang

Sistem *Dynamic Food Clearing House* mengintegrasikan 5 sumber data heterogen dengan karakteristik, taksonomi kategori, dan geografi yang berbeda:
1. **Grocery Inventory (Kaggle)** — 1.000 SKU data stok inventaris supermarket (stok, reorder level, turnover rate).
2. **Perishable Goods Management (Kaggle)** — 100.000 transaksi barang mudah rusak, 10 kategori produk.
3. **Store Sales Time-Series / M5 Favorita (Kaggle)** — Pola deret waktu penjualan harian dan dampak promosi.
4. **Food Waste Prediction Dataset (8K rows)** — Probabilitas pemborosan berdasarkan tipe bisnis, suhu penyimpanan, dan sisa umur.
5. **DOSM PriceCatcher (OpenDOSM Malaysia)** — Data harga komoditas pangan riil di pasar Malaysia (dalam Ringgit Malaysia / MYR).

Tugas Person 3 adalah melakukan **harmonisasi kanonikal** tanpa menghilangkan kekhasan masing-masing dataset, menyatukannya ke dalam skema terpadu **`canonical_batch_table.csv`**.

---

## 2. Taksonomi Kategori Kanonikal (Category Harmonization Matrix)

Berikut adalah tabel pemetaan resmi untuk menyelaraskan nilai kategori mentah dari 5 dataset ke dalam 6 Kategori Kanonikal baku:

| Kategori Kanonikal | Grocery Inventory (`Category`) | Perishable Goods (`category`) | M5 / Favorita (`family`) | Food Waste 8K (`Food_Category`) | DOSM PriceCatcher (`item_group`) |
|---|---|---|---|---|---|
| **`Produce`** | `Fruits & Vegetables`, `Produce` | `Vegetables`, `Fruits`, `Produce` | `PRODUCE` | `Vegetables`, `Fruits` | Sayur-sayuran, Buah-buahan |
| **`Dairy`** | `Dairy` | `Dairy`, `Eggs` | `DAIRY`, `EGGS` | `Dairy` | Susu & Produk Tenusu, Telur |
| **`Meat`** | `Meat & Poultry` | `Meat`, `Poultry`, `Seafood` | `MEATS`, `POULTRY`, `SEAFOOD` | `Meat` | Daging Segar, Ayam, Makanan Laut |
| **`Bakery`** | `Bakery` | `Bakery`, `Bread` | `BREAD/BAKERY` | `Bakery` | Roti, Barangan Bakeri |
| **`Pantry`** | `Canned Goods`, `Grains`, `Oils & Fats` | `Dry Goods`, `Canned Goods` | `GROCERY I`, `GROCERY II` | `Prepared Food` | Barangan Kering, Beras, Minyak |
| **`Beverages`** | `Beverages` | `Beverages`, `Juices` | `BEVERAGES` | *(N/A)* | Minuman |

---

## 3. Standardisasi Satuan Ukuran (Unit of Measure - UOM)

Dataset mentah menggunakan satuan yang bervariasi (`kg`, `pack`, `box`, `crate`, `unit`). Pada skema kanonikal, seluruh kuantitas distandarisasi ke basis **`kg`** untuk produk timbang (*bulk produce/meat*) dan **`unit`** untuk barang kemasan:

| Satuan Mentah | Kategori Terkait | Aturan Konversi ke Kanonikal | Satuan Kanonikal (`uom`) |
|---|---|---|---|
| `kg`, `kilogram` | Produce, Meat | Nilai langsung | `kg` |
| `g`, `gram` | Produce, Meat, Dairy | `quantity = raw_qty / 1000.0` | `kg` |
| `pack`, `packet` | Dairy, Bakery, Pantry | 1 pack dihitung 1 unit kemasan | `unit` |
| `box`, `crate` | Produce, Beverages | 1 crate = 10 unit / 10 kg | `unit` / `kg` |
| `bottle`, `can` | Beverages, Pantry | 1 botol/kaleng = 1 unit | `unit` |

---

## 4. Lokalisasi Geografis & Moneter Malaysia

1. **Mata Uang:**  
   Seluruh nilai moneter diwajibkan dalam **Ringgit Malaysia (MYR / RM)** dengan 2 angka di belakang koma (`NUMERIC(8,2)`):
   - Dataset dengan mata uang USD dikalibrasikan menggunakan kurs retail `1 USD = 4.45 MYR` atau lookup ke acuan harga pasar DOSM PriceCatcher.
2. **Jaringan Toko Supermarket (Lembah Klang):**
   - Toko di-mapping ke cabang supermarket terverifikasi di wilayah Kuala Lumpur dan Selangor:
     - `MY-KL-001`: Supermarket Flagship Bukit Bintang, KL
     - `MY-KL-002`: Supermarket Cheras Leisure Mall, KL
     - `MY-SGR-001`: Supermarket Subang Jaya Empire, Selangor
     - `MY-SGR-002`: Supermarket Petaling Jaya SS2, Selangor
3. **Format Waktu & Tanggal:**
   - Tanggal: ISO-8601 `YYYY-MM-DD`
   - Timestamp Simulasi: ISO-8601 dengan timezone UTC+8 Malaysia (`YYYY-MM-DDTHH:MM:SS+08:00`).

---

## 5. Spesifikasi Kolom `canonical_batch_table.csv`

| Nama Kolom | Tipe Data | Wajib | Keterangan & Asal Sumber |
|---|---|:---:|---|
| `batch_id` | `VARCHAR(32)` | Ya | Primary Key unik (format: `CAN-XXXX`) |
| `product_id` | `VARCHAR(32)` | Ya | Kode SKU produk terstandarisasi |
| `product_name` | `VARCHAR(128)` | Ya | Nama resmi produk |
| `canonical_category` | `VARCHAR(64)` | Ya | Salah satu dari 6 kategori kanonikal |
| `quantity` | `NUMERIC(10,2)` | Ya | Jumlah stok aktif |
| `uom` | `VARCHAR(16)` | Ya | Satuan ukuran: `kg` atau `unit` |
| `expiry_date` | `DATE` | Ya | Format `YYYY-MM-DD` |
| `unit_price_myr` | `NUMERIC(8,2)` | Ya | Harga jual acuan dalam MYR |
| `store_id` | `VARCHAR(32)` | Ya | Kode lokasi cabang toko ritel |
| `date_received` | `DATE` | Ya | Tanggal kedatangan stok |
| `shelf_life_days` | `INTEGER` | Ya | Total umur simpan lot |
| `days_to_expiry` | `INTEGER` | Ya | Sisa hari aktif kedaluwarsa (DTE) |
| `turnover_ratio` | `NUMERIC(6,2)` | Ya | Rasio perputaran stok |
| `stock_pressure` | `NUMERIC(6,2)` | Ya | Rasio tekanan inventaris |
| `demand_forecast_3d` | `NUMERIC(10,2)` | Opsional | Estimasi permintaan 3 hari (Person 2) |
| `waste_risk_score` | `NUMERIC(4,3)` | Opsional | Probabilitas waste 0.0 - 1.0 (Person 5) |
| `risk_label` | `VARCHAR(16)` | Opsional | `HIGH`, `MODERATE`, atau `LOW` (Person 1) |

---

## 6. Prosedur Eksekusi

Pipeline penggabungan dieksekusi oleh modul [`src/etl/canonical_schema.py`](file:///c:/Users/Matthew/Documents/Univ/Year%202/Sem%204/Applied%20ML/food-cleaning-ait201/src/etl/canonical_schema.py) yang menyediakan fungsi:
```python
def merge_to_canonical(
    df_inventory: pd.DataFrame,
    df_perishable: pd.DataFrame | None = None,
    df_forecast: pd.DataFrame | None = None,
    df_dosm_price: pd.DataFrame | None = None
) -> pd.DataFrame:
    ...
```
Output disimpan di folder `data/processed/canonical_batch_table.csv` dan disinkronkan ke `output/canonical_batch_table.csv`.

