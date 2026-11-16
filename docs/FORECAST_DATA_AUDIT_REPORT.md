# Audit Ketersediaan Data & Validasi Model Peramalan Permintaan (Tahap 3)

**Tanggal Audit:** 16 November 2026  
**Auditor:** Antigravity System Engineer  
**Status Evaluasi:** `not_validated` (Advisory Baseline)

---

## 1. Ringkasan Hasil Pemeriksaan Sumber Data

| Pemeriksaan | Hasil Temuan | Bukti Teknis |
|---|---|---|
| **Data Training Model Utama** | `data/processed/8_m5_train_food_cleaned.csv` | 1,273,104 baris transaksi time-series (Kaggle M5 / Corporación Favorita) |
| **Rentang Tanggal Training** | **01 Januari 2013 s/d 15 Agustus 2017** | `min: 2013-01-01`, `max: 2017-08-15` |
| **Horizon Prediksi File Statis** | Horizon +1 (16 Agt 2017), +2 (17 Agt 2017), +3 (18 Agt 2017) | Tersimpan di `data/processed/three_day_forecast.json` |
| **Granularitas Data Model** | **Family-Level** (14 food families: PRODUCE, DAIRY, MEATS, dll.) | Model tidak dilatih pada level SKU produk tunggal |
| **Data Inventori Toko Saat Ini** | `data/processed/inventory_master.json` & Supabase Cloud | 61 batch bertanggal November 2026 (`dateIn: Nov 01, 2026`, `expiryDate: Nov 15, 2026`) |
| **Data Transaksi Kasir Riil Toko** | `data/processed/transactions.json` | 17 transaksi kasir lokal POS (rentang waktu November 2026) |
| **Apakah Data Penjualan Harian 2026 Lengkap Tersedia?** | **TIDAK TERSEDIA** (Hanya 17 transaksi POS demo, belum membentuk deret waktu harian 2+ tahun untuk retraining ML) | Data penjualan berkelanjutan tingkat SKU lokal belum mencukupi untuk model time-series |

---

## 2. Analisis Kesenjangan & Risiko (Gap Analysis)

1. **Kesenjangan Waktu (*Temporal Gap*):**
   - Model LightGBM dilatih dengan data time-series yang berakhir pada **15 Agustus 2017**.
   - Inventori toko yang dikelola berada pada tahun **2026**.
   - Proyeksi 3-hari tidak merefleksikan cuaca, inflasi, atau pola belanja konsumen lokal Malaysia tahun 2026.

2. **Kesenjangan Granularitas (*Granularity Gap*):**
   - Model memprediksi permintaan agregat per family (misal: total demand kategori `DAIRY` = 662 unit).
   - Nilai demand per SKU produk dihitung melalui disagregasi heuristik:
     $$\text{Weight} = \frac{\text{Stok Produk}}{\text{Total Stok Kategori}}$$
     $$\text{Demand SKU} = \text{Demand Family} \times \text{Weight}$$
   - **Kelemahan:** Produk yang stoknya banyak otomatis diprediksi memiliki demand tinggi, padahal stok besar bisa jadi merupakan barang tidak laku (*slow-moving*).

---

## 3. Keputusan dan Tindakan Resmi (Sesuai Bagian 4.5)

1. **Status Validasi Model:**
   - Status forecast **TETAP RESMI DIATUR KE `not_validated`** pada seluruh respons API dan UI.
   - Dilarang memberi status `validated` atau mengklaim akurasi produksi tanpa data time-series penjualan riil.

2. **Transparansi UI:**
   - Label di UI wajib menampilkan:
     - 📅 Origin: `2017-08-15 (Kaggle M5)`
     - ⚖️ Alokasi: `Stock-Share Disaggregated`
     - ⚠️ Status: `Advisory / Not Validated for Auto-PO`
   - Label horizontal diubah dari tanggal hari ini menjadi `Horizon +1`, `Horizon +2`, `Horizon +3`.

3. **Status Fitur Bisnis Otomatis (Tahap 6):**
   - Fitur **Purchase Order (PO) otomatis TETAP TERKUNCI**.
   - Rekomendasi restock, markdown, dan donasi hanya disajikan sebagai **indikator pertimbangan (*advisory guidelines*)** dan tidak boleh mengeksekusi pembelian barang secara otomatis.
