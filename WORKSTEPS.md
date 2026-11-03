# WORKSTEPS — Dynamic Food Clearing House
> **Scope:** Step 7 (FEFO/Stok) → Step 14 (Monitoring)  
> Step 1–6 (produksi) hanya konteks; tidak dikerjakan di proyek ini.

---

> [!IMPORTANT]
> **🏗️ BASE** = Dikerjakan pertama (Fase 1). Sistem 6-langkah sesuai `Alur_Penggunaan_Sistem.pdf`.  
> **🚀 UPGRADE** = Dikerjakan setelah Base stabil (Fase 2). Penyempurnaan alur PDF dengan 3 dataset riil & smart dispatch OSRM.  
> **💡 OPSIONAL** = Fitur riset & analitik tambahan (seperti klastering toko K-Means) yang berada di luar alur operasional utama PDF (stretch goals).

---

## 🏗️ BASE — Step 7 — FEFO & Manajemen Stok Gudang

**Goal:** Membangun modul yang memprioritaskan lot berdasarkan expiry date (FEFO). Output: urutan prioritas dan badge risiko per lot untuk ditampilkan di layar toko.

**ML/Teknik:** Supervised — spoilage-risk classification  
**Person:** 1 (Kamu)

**Dataset:**
- 📦 [Grocery Inventory (Kaggle)](https://www.kaggle.com/datasets/willianoliveiragibin/grocery-inventory)
- 📦 [Perishable Goods Management (Kaggle)](https://www.kaggle.com/datasets/likithagedipudi/perishable-goods-management)

### Tasks
- [ ] Download & load dataset Grocery Inventory (setelah Person 0 perbaiki typo `Catagory`)
- [ ] EDA: distribusi expiry date, stock quantity, sales volume, inventory turnover rate
- [ ] Feature engineering: `days_to_expiry`, `turnover_ratio`, `batch_age`
- [ ] Buat label: klasifikasi spoilage-risk (`HIGH` / `MEDIUM` / `LOW`) berdasarkan `days_to_expiry` + `Reorder_Level`
- [ ] Training model klasifikasi spoilage-risk (Random Forest / XGBoost)
- [ ] Evaluasi model (accuracy, precision, recall, F1)
- [ ] Implementasi FEFO logic: sort lot berdasarkan `Expiration_Date` ascending
- [ ] Simpan ke `models/spoilage_classifier.pkl` + buat fungsi `predict_spoilage_risk(lot_dict)` → JSON `{"label": "HIGH", "score": 0.87}`

---

## 🏗️ BASE — Step 8 — Perencanaan Pengiriman (Demand Forecasting)

**Goal:** Memprediksi permintaan per produk 3 hari ke depan agar staf toko bisa melihat apakah lot berpotensi tidak habis terjual.

**ML/Teknik:** Supervised — time series demand forecasting  
**Person:** 2

**Dataset:**
- 📊 [M5 / Walmart Store Sales (Kaggle)](https://www.kaggle.com/competitions/store-sales-time-series-forecasting/data)
- 📊 [Retail Sales Forecast Dataset 2026 (Kaggle)](https://www.kaggle.com/datasets/mmumairkhattak/retail-sales-forecast-dataset-2026)

### Tasks — Base
- [ ] Load `train.csv` dan `transactions.csv` dari folder M5
- [ ] EDA: pola demand harian, efek promo & hari libur, seasonality
- [ ] Feature engineering: `lag_7`, `lag_14`, `rolling_mean_7`, `is_promo`
- [ ] Split data: train/test per time window (jangan acak — gunakan Rolling Window Validation)
- [ ] Training model forecasting (LightGBM / Prophet)
- [ ] Evaluasi model (MAE, RMSE, MAPE)
- [ ] Output: prediksi `demand_3day` per `product_id` untuk input dashboard

### Tasks — 🚀 UPGRADE (Tambah setelah Person 0 selesai kalender libur MY)
- [ ] Tambahkan kolom `is_holiday` dari `holidays_my.csv` ke training data
- [ ] Re-train model (~2 menit) — model kini peka terhadap lonjakan Hari Raya / Tahun Baru Imlek / Deepavali
- [ ] Evaluasi ulang MAPE sebelum vs sesudah: ukur peningkatan akurasi

---

## 🚀 UPGRADE — Step 9 — Mapping Tables & Canonical Schema

**Goal:** Menyatukan 5 dataset dari berbagai sumber ke dalam satu skema kanonikal. Dibutuhkan hanya jika Upgrade Simulator Multi-Sumber (Step 10 Full) dikerjakan.

**ML/Teknik:** Tidak ada — data engineering murni  
**Person:** 3

### Tasks
- [ ] Definisikan Canonical Schema: field wajib (`batch_id`, `product_id`, `category`, `quantity`, `expiry_date`, `price_myr`, `store_id`, `demand_forecast`, `risk_label`)
- [ ] Buat mapping table: kategori Grocery Inventory ↔ kategori M5 ↔ kategori Perishable Goods
- [ ] Buat mapping unit (kg/unit/pack → unit standar)
- [ ] Normalisasi harga ke MYR menggunakan lookup DOSM PriceCatcher (dari Person 0)
- [ ] Normalisasi timestamp ke timezone Malaysia (UTC+8)
- [ ] Buat fungsi `merge_to_canonical(df_inventory, df_forecast, df_price)` → DataFrame kanonikal
- [ ] Validasi: tidak ada null pada field wajib, tidak ada duplikat `batch_id`
- [ ] Output: `canonical_batch_table.csv`

---

## Step 10 — Simulator / Batch Generator

**Person:** 3

### 🏗️ BASE — Single-Source Batch Generator
**Goal:** Generator lot sederhana dari satu dataset inventory untuk mendemo sistem 6-langkah.

- [ ] Bersihkan dan standardisasi `Grocery_Inventory new v1.csv` ke skema dasar: `lot_id`, `product_name`, `category`, `quantity`, `expiry_date`, `store_id`
- [ ] Buat skrip generator lot sederhana yang membaca CSV dan menghasilkan daftar lot aktif
- [ ] Output: `lots_base.csv` — input langsung ke pipeline Spoilage Classifier dan Rule Engine Base

### 🚀 UPGRADE — Multi-Source Simulator Engine
**Goal:** Mensimulasikan aliran batch pangan sintetis yang dikalibrasi dari 5 dataset riil.

- [ ] Definisikan parameter simulasi: jumlah toko, jumlah produk, horizon waktu (30/60/90 hari)
- [ ] Implementasi generator batch sintetis (pakai distribusi dari Canonical Schema Step 9)
- [ ] Kalibrasi waste rate per kategori menggunakan FAO FLW benchmark
- [ ] Kalibrasi demand per toko menggunakan output Step 8
- [ ] Kalibrasi harga menggunakan PriceCatcher MYR (dari Person 0)
- [ ] Output: `simulation_events.csv` — log semua event batch selama horizon simulasi (event types: `received`, `active_fefo`, `markdown`, `dispatched`, `wasted`)

---

## 🏗️ BASE — Step 11 — Deteksi Surplus & Waste-Risk Scoring

**Goal:** Menambahkan model ML khusus yang memprediksi probabilitas lot terbuang berdasarkan kondisi penyimpanan dan tren bisnis. Ini **model terpisah** dari Spoilage Classifier di Step 7 — model Step 7 tidak perlu diulang.

**ML/Teknik:** Supervised — waste-risk scoring (regression + classification)  
**Person:** 5

**Dataset (disediakan Person 0 setelah imputasi):**
- 🗑️ `food_waste_dataset.csv` (8.000 baris — sudah diimputasi Person 0)
- 💰 Lookup DOSM PriceCatcher (dari Person 0) — untuk fitur `price_index_myr`

### Tasks
- [ ] Load `food_waste_dataset.csv` hasil imputasi Person 0
- [ ] EDA: distribusi label risiko HIGH/MEDIUM/LOW, korelasi fitur dengan waste
- [ ] Feature engineering: `days_to_expiry`, `demand_gap`, `price_index_myr`, `storage_temperature`, `business_type`
- [ ] Training model waste-risk (XGBoost — regression skor 0–1 + classification HIGH/MED/LOW)
- [ ] Evaluasi model (R² untuk regression, F1 untuk classification)
- [ ] Simpan ke `models/waste_risk_model.pkl`
- [ ] Output per lot: `waste_risk_score` (0–100%) + `time_to_waste_hours`

---

## Step 12 — Rekomendasi Jalur Surplus (Rule Engine)

**Person:** 4

### 🏗️ BASE — Rule Engine 3 Jalur
**Goal:** Fungsi sederhana yang merekomendasikan 3 aksi: Normal Sale, Markdown (diskon flat), atau Donate. Persis seperti tombol di PDF.

- [ ] Tulis fungsi `assign_route(days_to_expiry, quantity, demand_forecast)`:
  - `days_to_expiry > 3` → `"Normal Sale"`
  - `1 < days_to_expiry ≤ 3` → `"Markdown"` (diskon flat 20%)
  - `days_to_expiry ≤ 1` → `"Donate"`
- [ ] Buat unit test dengan 5 contoh lot dummy
- [ ] Output: field `recommended_route` + `discount_percent` per lot

### 🚀 UPGRADE — Rule Engine ReFED (10 Jalur + Anti-Moral-Hazard Pembeli)
**Goal:** Perluas fungsi yang sudah ada menggunakan taksonomi ReFED, harga pasar riil DOSM, dan pencegahan moral hazard pembeli (kanibalisasi penjualan).

- [ ] Baca & pahami taksonomi destinasi surplus ReFED (10 jalur)
- [ ] Perluas `assign_route()` dengan jalur komersial sebelum donasi: `normal_sale` → `dynamic_markdown` (DOSM MYR) → `b2b_wholesale` → `donation` *(tertutup & berkuota)* → `animal_feed` → `composting`
- [ ] Implementasi dynamic pricing: hitung `discount_percent` bertahap berdasarkan `days_to_expiry` & acuan harga pasar DOSM
- [ ] Implementasi anti-moral-hazard pembeli:
  - Salurkan donasi secara tertutup ke institusi/food bank terverifikasi (*channel segregation*), bukan di rak umum toko, agar konsumen tidak menahan belanja demi menunggu barang gratis.
  - Terapkan kuota donasi maksimal (maks 30% dari surplus) agar toko terdorong mengoptimalkan diskon komersial.
- [ ] Output: field `recommended_route`, `discount_percent`, `expected_value_myr` per lot

---

## 🏗️ BASE — Step 13 — Matching & Dispatch ke Penerima (OSRM)

**Goal:** Untuk lot yang masuk jalur donasi, sistem mencocokkan secara otomatis ke food bank / pantry terdekat dan menjadwalkan pengambilan.

> [!NOTE]
> **Ini jauh lebih simpel dari kedengarannya!** OSRM adalah API publik gratis. Memanggilnya hanya butuh **1 baris `requests.get()`**. Tidak perlu membangun routing engine sendiri.

**ML/Teknik:** Greedy optimization / nearest-neighbor matching (bukan ML)  
**Person:** 5

### Tasks
- [ ] Siapkan daftar 10–20 penerima fiktif realistis di Lembah Klang/Malaysia (CSV: `receiver_id`, `name`, `lat`, `lng`, `capacity`, `accepted_categories`)
- [ ] Geocoding: konversi alamat → koordinat via Nominatim API
- [ ] Implementasi OSRM API call: `requests.get("http://router.project-osrm.org/route/v1/driving/{lng_a},{lat_a};{lng_b},{lat_b}")` → dapat `distance_km` + `eta_hours`
- [ ] Implementasi greedy matching: sort penerima berdasarkan jarak terdekat, filter berdasarkan kapasitas & kategori diterima
- [ ] Implementasi dispatch schedule: `pickup_time = now + eta_hours`, validasi `pickup_time < expiry_time`
- [ ] Output: `dispatch_log.csv` — kolom `lot_id`, `receiver_id`, `distance_km`, `eta_hours`, `pickup_time`, `status`

---

## 💡 OPSIONAL — Step 14 — Monitoring & Clustering Toko (K-Means)

**Goal:** Menganalisis pola output simulator untuk menemukan toko mana yang paling boros dan produk mana yang paling sering surplus (stretch goal / nilai tambah analitik laporan akhir).

> [!NOTE]
> **K-Means hanya 5 baris Scikit-Learn.** Fitur ini berada di luar alur operasional 6-langkah toko PDF, berfungsi sebagai analisis manajerial dan bahan visualisasi laporan akademik.

**ML/Teknik:** Unsupervised — K-Means / DBSCAN clustering  
**Person:** 5 (dibantu Person 1)

### Tasks
- [ ] Agregasi output simulator: `waste_rate_per_store`, `velocity_per_product`, `acceptance_rate_per_receiver`
- [ ] EDA: visualisasi distribusi metrik per entitas
- [ ] Feature scaling: normalisasi fitur sebelum clustering
- [ ] Tentukan jumlah cluster optimal: Elbow Method + Silhouette Score
- [ ] Jalankan `KMeans(n_clusters=3).fit(df)` pada profil toko & produk
- [ ] Jalankan DBSCAN untuk deteksi outlier (toko dengan waste rate anomali tinggi)
- [ ] Interpretasi cluster: beri label human-readable (`"high-waste fast-moving"`, `"low-waste stable"`, dll.)
- [ ] Buat visualisasi scatter plot / heatmap
- [ ] Output: `cluster_report.md` + visualisasi PNG/HTML

---

## Deliverables Akhir

| Deliverable | Step | Phase |
|---|---|---|
| `lots_base.csv` (lot aktif toko) | Step 10 Base | 🏗️ BASE |
| `models/spoilage_classifier.pkl` | Step 7 | 🏗️ BASE |
| `models/demand_forecaster.pkl` | Step 8 | 🏗️ BASE |
| `canonical_batch_table.csv` | Step 9 | 🚀 UPGRADE |
| `simulation_events.csv` | Step 10 Full | 🚀 UPGRADE |
| `models/waste_risk_model.pkl` | Step 11 | 🏗️ BASE |
| `dispatch_log.csv` | Step 13 | 🏗️ BASE |
| `cluster_report.md` + visualisasi | Step 14 | 💡 OPSIONAL |

---

## Progress Tracker

| Step | Phase | Status |
|---|---|---|
| Step 7 — FEFO & Stok | 🏗️ BASE | ⬜ Belum dimulai |
| Step 7 — FEFO & Stok | 🏗️ BASE | ⬜ Belum dimulai |
| Step 8 — Demand Forecasting | 🏗️ BASE | ⬜ Belum dimulai |
| Step 10 Base — Batch Generator (`lots_base.csv`) | 🏗️ BASE | ⬜ Belum dimulai |
| Step 11 — Waste-Risk Scoring | 🏗️ BASE | ⬜ Menunggu Person 0 (dataset 8K) |
| Step 12 Base — Rule Engine 3 Jalur | 🏗️ BASE | ⬜ Belum dimulai |
| Step 13 — Matching & Dispatch (OSRM) | 🏗️ BASE | ⬜ Belum dimulai |
| Step 8 Upgrade — Kalender MY | 🚀 UPGRADE | ⬜ Menunggu Person 0 |
| Step 9 — Canonical Schema | 🚀 UPGRADE | ⬜ Belum dimulai |
| Step 10 Full — Multi-Source Simulator | 🚀 UPGRADE | ⬜ Belum dimulai |
| Step 12 Full — Rule Engine ReFED | 🚀 UPGRADE | ⬜ Menunggu Person 0 (DOSM) |
| Step 14 — Monitoring & Clustering | 💡 OPSIONAL | ⬜ Menunggu output simulator (stretch goal) |
