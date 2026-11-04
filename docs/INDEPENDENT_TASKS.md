# Daftar Pekerjaan Bebas Bottleneck (Day 1 Independent Tasks)

> **Dynamic Food Clearing House Simulator**
> Dokumen ini memetakan seluruh pekerjaan yang **TIDAK TERGANTUNG pada orang lain/pekerjaan lain**.
> Semua task di bawah ini bisa langsung dieksekusi sejak **Hari Pertama (Day 1)** tanpa perlu menunggu modul lain selesai.

---

## Phase Legend

| Label | Nama | Target | Deskripsi |
|---|---|---|---|
| 🏗️ **BASE** | PDF-Level | Fase 1 (Prioritas Utama) | Fitur minimum sesuai alur 6-langkah di `Alur_Penggunaan_Sistem.pdf` |
| 🚀 **UPGRADE** | Core Enhancement | Fase 2 (Ekspansi Skala) | Penyempurnaan alur PDF dengan 3 dataset riil, smart dispatch OSRM, & anti-moral-hazard pembeli |
| 💡 **OPSIONAL** | Stretch Goals | Fase 3 (Fitur Opsional) | Eksplorasi di luar alur operasional utama PDF (K-Means klastering toko, monitoring kompleks) |

> **Catatan penting:** Task UPGRADE dimulai setelah BASE stabil. Sebagian besar Upgrade jauh lebih sederhana
> dari namanya: OSRM = 1 baris `requests.get(...)`, Malaysia holidays = CSV 20 baris, Food waste 8K = imputasi median.
> Fitur OPSIONAL (seperti K-Means) hanya dikerjakan jika modul utama sudah berjalan lancar.

---

## Ringkasan: Siapa Bisa Langsung Kerja Apa?

| Peran | Penanggung Jawab | Task BASE (Mulai Sekarang) | Task UPGRADE (Selaras PDF & 3 Dataset) | Opsional 💡 (Stretch) |
|---|---|---|---|---|
| **Dataset Engineer** | Person 0 | Perbaikan typo + null (±1 jam) | DOSM lookup, holidays CSV, imputasi 8K | — |
| **ML Tabular Lead** | Person 1 (Kamu) | **Goal 1:** Spoilage Classifier | Supervisi tim + validasi OSRM dispatch | Bantu **Goal 8** jika dikerjakan |
| **Forecaster & API** | Person 2 | **Goal 2:** Demand Forecasting baseline + **Goal 10:** FastAPI scaffold | Tambah Malaysia holidays ke model | — |
| **Data Architect** | Person 3 | **Goal 4 Base:** ETL Pipeline Tunggal → `lots_base.csv` | **Goal 3:** Canonical Schema 5 Dataset + **Goal 4 Full:** Multi-Source Simulator Engine | — |
| **Logic & Database** | Person 4 | **Goal 6 Base+:** Rule Engine Dynamic Markdown + Anti-Moral-Hazard (DOSM) + **Goal 9:** Supabase setup | **Goal 6 Full:** ReFED 10-Destinasi Lengkap | — |
| **Risk & Dispatch** | Person 5 | **Goal 5:** Waste-Risk model + **Goal 7:** OSRM Smart Dispatch (receivers CSV + matching + rute riil) | **Goal 7 Multi:** Multi-Drop Dispatch Optimization | **Goal 8:** K-Means Clustering |
| **Frontend & Design** | Person 6 | **Goal 11 & 12:** Next.js 6-langkah layout + **Peta Rute Leaflet JS** (BASE) + Canva theme | Peta multi-store multi-layer | Tambah Tab Klaster Toko |

---

## Rincian Pekerjaan Mandiri per Orang

### 1. Person 0 — Dataset Quality Engineering

Tidak memerlukan kode atau output dari siapapun. Langsung bekerja pada file mentah:

#### 🏗️ BASE Tasks (±1 jam, selesaikan Minggu 1)
- [x] Rename kolom `Catagory` → `Category` di `Grocery_Inventory new v1.csv` (1 baris Python).
- [x] Isi nilai null baris 574 Cabbage dengan `'Produce'` (manual assignment).
- [ ] Dokumentasikan hasil perbaikan di `dataset_fixes.md`.

#### 🚀 UPGRADE Tasks (bisa dikerjakan paralel, tidak blokir orang lain)
- [ ] Unduh tabel lookup DOSM (`item.parquet` dan `premise.parquet`) dari portal OpenDOSM — diperlukan agar PriceCatcher bisa dipetakan ke nama produk dan toko riil Malaysia.
- [ ] Siapkan file CSV kalender hari libur nasional Malaysia (~20 baris) — substitusi libur Ekuador yang salah di dataset M5/Favorita.
- [ ] Lakukan imputasi group-median pada 5 kolom null di `food_waste_dataset.csv` (8K rows) — ~30 menit dengan bantuan AI.
- [ ] Update `dataset_fixes.md` dengan hasil Upgrade.

---

### 2. Person 1 (Kamu) — Goal 1: Spoilage & FEFO Classifier 🏗️ BASE

Dataset sudah tersedia di folder lokal (`Grocery Inventory` / `perishable_goods_management.csv`). **100% tidak blokir siapapun dan tidak diblokir siapapun.**

- [x] Lakukan Exploratory Data Analysis (EDA) distribusi kedaluwarsa dan perputaran stok.
- [x] Feature engineering: hitung `days_to_expiry` dan `turnover_ratio`.
- [x] Buat label risiko kerusakan (`HIGH`, `MEDIUM`, `LOW`).
- [x] Latih model klasifikasi (Random Forest / XGBoost) dengan Scikit-Learn.
- [x] Evaluasi performa (Confusion Matrix, F1-Score) dan simpan model ke `models/spoilage_classifier.pkl`.
- [x] Buat fungsi inferensi mandiri: `predict_spoilage_risk(batch_dict)`.

> *(Setelah BASE selesai: alihkan ke supervisi tim + bantu Person 5 interpretasi K-Means untuk Goal 8)*

---

### 3. Person 2 — Goal 2 (Forecasting) & Goal 10 (API Skeleton)

Dua pekerjaan ini sama sekali tidak menunggu pipeline selesai:

#### 🏗️ BASE Tasks
- **Bagian Forecasting (Goal 2):**
  - [ ] Load data `train.csv` dan `transactions.csv` dari folder `8. store-sales-time-series-forecasting/`.
  - [ ] Buat pipeline time-series baseline (lag-7, lag-14, rolling mean penjualan).
  - [ ] Latih model baseline forecasting (LightGBM / Prophet) tanpa Malaysia holidays.
  - [ ] Simpan model ke `models/demand_forecast_base.pkl`.
- **Bagian Backend API (Goal 10):**
  - [ ] Inisialisasi struktur folder FastAPI (`routers/`, `schemas/`, `services/`).
  - [ ] Buat skema Pydantic untuk request/response.
  - [ ] Buat endpoint dummy yang mengembalikan JSON tiruan (`GET /api/batches`, `GET /api/dashboard/summary`).
  - [ ] Pastikan dokumentasi Swagger di `http://localhost:8000/docs` sudah bisa diakses dan dites.

#### 🚀 UPGRADE Tasks
- [ ] Setelah Person 0 menyerahkan Malaysia holidays CSV (~20 baris): tambahkan sebagai fitur `is_holiday` ke model forecasting.
- [ ] Re-train model (~2 menit) dan simpan sebagai `models/demand_forecast_upgrade.pkl`.
- [ ] Update endpoint `/api/dashboard/summary` untuk kembalikan forecast dengan holiday awareness.

---

### 4. Person 3 — Pipeline & Schema

#### 🏗️ BASE Tasks (Goal 4 Base — ETL Pipeline Tunggal)
Fokus pada satu dataset saja (`Grocery_Inventory`). Goal 3 (Canonical Schema multi-dataset) adalah UPGRADE — jangan dikerjakan dulu:
- [ ] Buka dan eksplorasi `Grocery_Inventory new v1.csv` (setelah Person 0 fix typo `Catagory`).
- [ ] Tulis script ETL Python (`etl/process_store_inventory.py`): bersihkan, validasi, dan standardisasi kolom (`lot_id`, `product_name`, `category`, `quantity`, `expiry_date`, `unit_price_myr`).
- [ ] Tetapkan standar format tanggal (`YYYY-MM-DD`) dan satuan unit.
- [ ] Ekspor `lots_base.csv` — input langsung ke Spoilage Classifier (Person 1), Rule Engine (Person 4), dan Supabase (Person 4).
- [ ] Buat script validasi integritas: tidak ada tanggal kedaluwarsa negatif, tidak ada kuantitas null.
#### 🚀 UPGRADE Tasks (Canonical Schema multi-dataset)
- [ ] Buka sampel 5 baris dari tiap dataset (Inventory, M5, Food Waste, PriceCatcher).
- [ ] Susun tabel mapping padanan kategori (misal: `Produce` ↔ `FOODS_1` ↔ `Sayur`) — **Goal 3 Canonical Schema**.
- [ ] Perluas pipeline untuk merge semua dataset ke satu `canonical_batch_table.csv` yang komprehensif — **Goal 4 Full**.
- [ ] Dokumentasikan mapping di `schema_mapping.md`.

---

### 5. Person 4 — Rule Engine & Database

Logika bisnis dan struktur database bisa dibangun dengan mock data:

#### 🏗️ BASE Tasks
- **Bagian Rule Engine Dynamic Markdown + Anti-Moral-Hazard (Goal 6 Base+):**
  - [ ] Tulis logika Python `assign_route(days_to_expiry, quantity, forecast_demand, price_myr)` dengan 3 jalur: `normal_sale`, `dynamic_markdown` (diskon bertahap berbasis harga DOSM MYR dari Person 0), `donation`.
  - [ ] Implementasikan aturan *anti-moral-hazard pembeli*: donasi disalurkan secara tertutup ke food bank terverifikasi (bukan di rak toko), kuota donasi maksimal 30% dari surplus.
  - [ ] Buat unit test sederhana dengan 5 contoh dictionary batch dummy.
- **Bagian Cloud Database (Goal 9):**
  - [ ] Buat project baru di [supabase.com](https://supabase.com).
  - [ ] Eksekusi skrip DDL SQL untuk membuat 5 tabel (`batches`, `simulation_events`, `dispatch_log`, `receivers`, `cluster_results`) — **termasuk kolom Upgrade sebagai NULL placeholder**.
  - [ ] Konfigurasi hak akses Row Level Security (RLS).

#### 🚀 UPGRADE Tasks
- **Bagian Rule Engine ReFED Full (Goal 6 Full):**
  - [ ] Pelajari taksonomi 10 destinasi surplus ReFED.
  - [ ] Perluas `assign_route()` dengan semua 10 jalur ReFED.
  - [ ] Implementasikan dynamic pricing berbasis harga pasar riil DOSM (dari Person 0).
  - [ ] **Implementasikan aturan anti-moral-hazard pembeli:**
    - Segregasi jalur donasi secara tertutup ke institusi sosial berizin (*channel segregation*) agar konsumen toko tidak menahan pembelian demi menunggu donasi gratis.
    - Kuota donasi maksimal (maks 30% dari total batch surplus).

---

### 6. Person 5 — Risk, Dispatch & Analytics

> **Klarifikasi scope:** Goal 5 & 7 adalah **penyempurnaan langsung dari alur PDF Langkah 5** (dari sekadar "kirim ke food bank" menjadi pencarian penerima riil, kapasitas, rute, dan ETA). Teknisnya sangat ringkas: OSRM hanya butuh 1 baris kode! Goal 8 (K-Means) adalah eksplorasi analitik opsional.

#### 🏗️ BASE Tasks (bisa dikerjakan Day 1)
- [ ] Buat daftar 10–20 penerima fiktif realistis di area Lembah Klang/Malaysia (nama, jenis, kapasitas, kategori diterima) — simpan sebagai `data/receivers_list.csv`.
- [ ] Tulis fungsi seleksi sederhana (greedy Euclidean): `select_receiver(batch, receivers_df)` — pilih penerima dengan kapasitas cukup + kategori sesuai, tanpa OSRM dulu.
- [ ] Buat unit test: jalankan fungsi dengan 5 batch dummy, pastikan output `receiver_id` valid.

#### 🏗️ BASE Tasks — Goal 5 & Goal 7 (Selaras Alur PDF Langkah 5)
- **Goal 5 — Waste-Risk Model:**
  - [ ] Gunakan `food_waste_dataset.csv` (8.000 baris, setelah Person 0 imputasi).
  - [ ] Latih model klasifikasi/regresi untuk memprediksi probabilitas waste (`waste_risk_score`).
  - [ ] Simpan model ke `models/waste_risk_model.pkl`.
- **Goal 7 — OSRM Routing (Penyempurnaan Langkah 5 PDF: Smart Dispatch):**
  - [ ] Tes integrasi API Nominatim untuk mengubah alamat penerima menjadi koordinat lat/long.
  - [ ] Tes pemanggilan API OSRM publik: `requests.get("http://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}")` — **1 baris kode**.
  - [ ] Upgrade fungsi `select_receiver()` agar gunakan jarak riil OSRM (km + ETA) bukan Euclidean.
  - [ ] Simpan polyline rute ke `dispatch_log.csv` untuk ditampilkan di Peta Rute frontend.

#### 🚀 UPGRADE Tasks
- **Goal 7 Multi — Multi-Drop Dispatch Optimization:**
  - [ ] Upgrade dispatch agar 1 armada bisa mengambil surplus dari 2 toko terdekat sekaligus (multi-stop OSRM route).
  - [ ] Update `dispatch_log.csv` dengan kolom `multi_stop` dan urutan pickup.

---

### 7. Person 6 — Frontend UI & Design

Frontend modern tidak perlu menunggu backend selesai berkat teknik *mocking*:

#### 🏗️ BASE Tasks
- [ ] Inisialisasi project Next.js + Tailwind CSS.
- [ ] Buat komponen statis KPI Cards (Total Batch Diselamatkan, Rasio Waste, dll.) dengan data JSON dummy.
- [ ] Buat komponen visualisasi grafik (Recharts / Chart.js): Waste Risk Distribution + Batch Route Funnel.
- [ ] Buat tabel Batch List dengan filter dummy (store, category, risk_label, route).
- [ ] Buat layout halaman Admin `/admin` dengan proteksi form login Supabase Auth.
- [ ] Buat template slide presentasi di Canva (palet warna, tipografi, layout konsisten).
- [ ] Install `leaflet` + `react-leaflet`.
- [ ] Tambah **Peta Rute Interaktif Leaflet JS**: plot marker toko + food bank + polyline rute jalan riil OSRM — **visualisasi Langkah 5 PDF**.
- [ ] Tambah badge warna `waste_risk_score` di tabel Batch List (merah/kuning/hijau).

#### 🚀 UPGRADE Tasks
- [ ] Tambah layer visualisasi seluruh armada pengiriman **multi-store** di peta Leaflet (filter per `store_id` cabang).
#### 💡 OPSIONAL Tasks (Stretch Goals)
- [ ] Tambah **Tab "Klaster Toko"**: scatter plot K-Means dari `cluster_results` (analisis profil toko multi-cabang).

---

## Pekerjaan yang MEMANG Kena Bottleneck (Dikerjakan Nanti)

Pekerjaan berikut adalah satu-satunya bagian yang **harus menunggu** modul lain selesai:

### 🏗️ BASE Bottlenecks

| Pekerjaan yang Menunggu | Menunggu Apa? | Kapan Mulai? |
|---|---|---|
| **Step A2 BASE:** Upload `batches` ke Supabase | Output `lots_base.csv` dari Person 3 | Minggu ke-2/3 |
| **Goal 5 (Person 5):** Waste-Risk model | Person 0 selesai imputasi 8K (`food_waste_dataset.csv`) | Setelah Person 0 selesai |
| **Goal 7 (Person 5):** OSRM Dispatch Engine | `receivers_list.csv` tersedia + Person 5 selesai greedy placeholder | Setelah BASE placeholder selesai |
| **Peta Rute Leaflet (Person 6):** Visualisasi rute | Person 5 Goal 7 selesai, polyline tersedia | Setelah Goal 7 selesai |
| **Koneksi frontend ke API asli** | API FastAPI Person 2 membaca Supabase asli | Akhir BASE phase |
### 🚀 UPGRADE Bottlenecks (Core Enhancement)

| Pekerjaan yang Menunggu | Menunggu Apa? | Kapan Mulai? |
|---|---|---|
| **Goal 4 Full (Person 3):** Multi-dataset merge | Person 0 selesai DOSM lookup | Setelah BASE stabil |
| **Step A2 UPGRADE:** Upload events & dispatch log | Output simulasi Step 10 & 13 selesai | Setelah Upgrade dimulai |

### 💡 OPSIONAL Bottlenecks (Stretch Goals)

| Pekerjaan yang Menunggu | Menunggu Apa? | Kapan Mulai? |
|---|---|---|
| **Goal 8 (Person 5):** K-Means Clustering Toko | Output CSV simulasi Goal 4 + Goal 7 | Hanya jika tugas utama selesai lebih awal |
| **Step A2:** Upload tabel cluster results | Goal 8 selesai dieksekusi | Opsional / Stretch goal |

---

## Kesimpulan Strategis

> **90% pekerjaan awal proyek ini adalah pekerjaan paralel.**
> Tidak ada alasan anggota tim berkata *"saya belum bisa mulai karena nunggu modul si X"*. Semua orang
> punya komponen BASE yang bisa langsung dikerjakan dan diuji sejak hari pertama menggunakan *dummy data*
> atau data mentah masing-masing.
>
> Upgrade bukan pekerjaan baru yang terpisah — Upgrade adalah **penyempurnaan** dari BASE yang sudah jalan.
> Dan sebagian besar Upgrade jauh lebih sederhana dari namanya. Yang penting BASE dulu.
