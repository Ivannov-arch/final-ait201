# Daftar Pekerjaan Bebas Bottleneck (Day 1 Independent Tasks)

> **Dynamic Food Clearing House Simulator**
> Dokumen ini memetakan seluruh pekerjaan yang **TIDAK TERGANTUNG pada orang lain/pekerjaan lain**.
> Semua task di bawah ini bisa langsung dieksekusi sejak **Hari Pertama (Day 1)** tanpa perlu menunggu modul lain selesai.

---

## Phase Legend

| Label | Nama | Target |
|---|---|---|
| 🏗️ **BASE** | PDF-Level | Sebelum UTS — fitur sesuai `Alur_Penggunaan_Sistem.pdf` |
| 🚀 **UPGRADE** | Blueprint-Level | Sebelum UAS — fitur dari `problem_statement.md` (Clearing House penuh) |

> **Catatan penting:** Task UPGRADE dimulai setelah BASE stabil — bukan karena lebih sulit, tapi
> karena butuh output BASE sebagai input. Sebagian besar Upgrade jauh lebih sederhana dari namanya:
> OSRM = 1 baris `requests.get(...)`, K-Means = 5 baris Scikit-Learn, Malaysia holidays = CSV 20 baris.

---

## Ringkasan: Siapa Bisa Langsung Kerja Apa?

| Peran | Penanggung Jawab | Task BASE (Mulai Sekarang) | Task UPGRADE (Setelah BASE Stabil) |
|---|---|---|---|
| **Dataset Engineer** | Person 0 | Perbaikan typo + null (±1 jam) | DOSM lookup, holidays CSV, imputasi 8K |
| **ML Tabular Lead** | Person 1 (Kamu) | **Goal 1:** Spoilage Classifier | *(Tidak ada — fokus supervisi + bantu Person 5 Goal 8)* |
| **Forecaster & API** | Person 2 | **Goal 2:** Demand Forecasting baseline + **Goal 10:** FastAPI scaffold | Tambah Malaysia holidays ke model |
| **Data Architect** | Person 3 | Pipeline single-dataset (`Grocery_Inventory`) | **Goal 3:** Canonical Schema multi-dataset + **Goal 4 Full** |
| **Logic & Database** | Person 4 | **Goal 6 Base:** Rule Engine 3-jalur + **Goal 9:** Supabase setup | **Goal 6 Full:** ReFED 10-destinasi + dynamic pricing |
| **Risk & Dispatch** | Person 5 | Siapkan daftar receivers CSV + greedy Euclidean matching placeholder | **Goal 5:** Waste-Risk model + **Goal 7:** OSRM + **Goal 8:** Clustering |
| **Frontend & Design** | Person 6 | **Goal 11 & 12:** Next.js layout + mock data + Canva theme | Tambah Tab Peta Rute (Leaflet) + Tab Klaster |

---

## Rincian Pekerjaan Mandiri per Orang

### 1. Person 0 — Dataset Quality Engineering

Tidak memerlukan kode atau output dari siapapun. Langsung bekerja pada file mentah:

#### 🏗️ BASE Tasks (±1 jam, selesaikan Minggu 1)
- [ ] Rename kolom `Catagory` → `Category` di `Grocery_Inventory new v1.csv` (1 baris Python).
- [ ] Isi nilai null baris 574 Cabbage dengan `'Produce'` (manual assignment).
- [ ] Dokumentasikan hasil perbaikan di `dataset_fixes.md`.

#### 🚀 UPGRADE Tasks (bisa dikerjakan paralel, tidak blokir orang lain)
- [ ] Unduh tabel lookup DOSM (`item.parquet` dan `premise.parquet`) dari portal OpenDOSM — diperlukan agar PriceCatcher bisa dipetakan ke nama produk dan toko riil Malaysia.
- [ ] Siapkan file CSV kalender hari libur nasional Malaysia (~20 baris) — substitusi libur Ekuador yang salah di dataset M5/Favorita.
- [ ] Lakukan imputasi group-median pada 5 kolom null di `food_waste_dataset.csv` (8K rows) — ~30 menit dengan bantuan AI.
- [ ] Update `dataset_fixes.md` dengan hasil Upgrade.

---

### 2. Person 1 (Kamu) — Goal 1: Spoilage & FEFO Classifier 🏗️ BASE

Dataset sudah tersedia di folder lokal (`Grocery Inventory` / `perishable_goods_management.csv`). **100% tidak blokir siapapun dan tidak diblokir siapapun.**

- [ ] Lakukan Exploratory Data Analysis (EDA) distribusi kedaluwarsa dan perputaran stok.
- [ ] Feature engineering: hitung `days_to_expiry` dan `turnover_ratio`.
- [ ] Buat label risiko kerusakan (`HIGH`, `MEDIUM`, `LOW`).
- [ ] Latih model klasifikasi (Random Forest / XGBoost) dengan Scikit-Learn.
- [ ] Evaluasi performa (Confusion Matrix, F1-Score) dan simpan model ke `models/spoilage_classifier.pkl`.
- [ ] Buat fungsi inferensi mandiri: `predict_spoilage_risk(batch_dict)`.

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

#### 🏗️ BASE Tasks (single-dataset pipeline)
Fokus pada satu dataset dulu sebelum canonical schema multi-dataset:
- [ ] Buka dan eksplorasi `Grocery_Inventory new v1.csv` (setelah Person 0 fix typo).
- [ ] Buat pipeline Python untuk membersihkan, memvalidasi, dan mengekspor `canonical_batch_table.csv` dari dataset tunggal ini.
- [ ] Tetapkan standar format tanggal (`YYYY-MM-DD`) dan konversi harga ke MYR dari dataset ini saja.
- [ ] Pastikan output CSV kompatibel dengan schema Supabase Person 4.

#### 🚀 UPGRADE Tasks (Canonical Schema multi-dataset)
- [ ] Buka sampel 5 baris dari tiap dataset (Inventory, M5, Food Waste, PriceCatcher).
- [ ] Susun tabel mapping padanan kategori (misal: `Produce` ↔ `FOODS_1` ↔ `Sayur`) — **Goal 3 Canonical Schema**.
- [ ] Perluas pipeline untuk merge semua dataset ke satu `canonical_batch_table.csv` yang komprehensif — **Goal 4 Full**.
- [ ] Dokumentasikan mapping di `schema_mapping.md`.

---

### 5. Person 4 — Rule Engine & Database

Logika bisnis dan struktur database bisa dibangun dengan mock data:

#### 🏗️ BASE Tasks
- **Bagian Rule Engine 3-Jalur (Goal 6 Base):**
  - [ ] Tulis logika murni Python `assign_route(days_to_expiry, risk_score, price)` dengan 3 jalur: `normal_sale`, `discount_sale`, `donation`.
  - [ ] Buat unit test sederhana dengan 5 contoh dictionary batch dummy.
  - [ ] *Belum perlu:* dynamic pricing, kuota anti-moral-hazard, ReFED 10 destinasi (itu Upgrade).
- **Bagian Cloud Database (Goal 9):**
  - [ ] Buat project baru di [supabase.com](https://supabase.com).
  - [ ] Eksekusi skrip DDL SQL untuk membuat 5 tabel (`batches`, `simulation_events`, `dispatch_log`, `receivers`, `cluster_results`) — **termasuk kolom Upgrade sebagai NULL placeholder**.
  - [ ] Konfigurasi hak akses Row Level Security (RLS).

#### 🚀 UPGRADE Tasks
- **Bagian Rule Engine ReFED Full (Goal 6 Full):**
  - [ ] Pelajari taksonomi 10 destinasi surplus ReFED.
  - [ ] Perluas `assign_route()` dengan semua 10 jalur ReFED.
  - [ ] Implementasikan rumus dynamic pricing (penurunan harga bertahap berdasarkan `days_to_expiry`).
  - [ ] Implementasikan aturan kuota donasi maksimal (anti-moral-hazard: maks 30% batch ke donasi).

---

### 6. Person 5 — Risk, Dispatch & Clustering

> **Klarifikasi scope:** Goal 5, 7, 8 adalah **inti inovasi proyek** — inilah yang membedakan kita dari
> sekadar "kirim ke food bank terdekat". Tapi teknis pengerjaannya jauh lebih sederhana dari namanya:
> OSRM = 1 baris `requests.get(...)`, K-Means = 5 baris Scikit-Learn.

#### 🏗️ BASE Tasks (bisa dikerjakan Day 1)
- [ ] Buat daftar 10–20 penerima fiktif realistis di area Lembah Klang/Malaysia (nama, jenis, kapasitas, kategori diterima) — simpan sebagai `data/receivers_list.csv`.
- [ ] Tulis fungsi seleksi sederhana (greedy Euclidean): `select_receiver(batch, receivers_df)` — pilih penerima dengan kapasitas cukup + kategori sesuai, tanpa OSRM dulu.
- [ ] Buat unit test: jalankan fungsi dengan 5 batch dummy, pastikan output `receiver_id` valid.

#### 🚀 UPGRADE Tasks (setelah BASE stabil)
- **Goal 5 — Waste-Risk Model:**
  - [ ] Gunakan `food_waste_dataset.csv` (8.000 baris, setelah Person 0 imputasi).
  - [ ] Latih model klasifikasi/regresi untuk memprediksi probabilitas waste (`waste_risk_score`).
  - [ ] Simpan model ke `models/waste_risk_model.pkl`.
- **Goal 7 — OSRM Routing (inti inovasi: "cara memilih food bank + jarak/ETA pengiriman"):**
  - [ ] Tes integrasi API Nominatim untuk mengubah alamat penerima menjadi koordinat lat/long.
  - [ ] Tes pemanggilan API OSRM publik: `requests.get("http://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}")` — **1 baris kode**.
  - [ ] Upgrade fungsi `select_receiver()` agar gunakan jarak riil OSRM (km + ETA) bukan Euclidean.
  - [ ] Simpan polyline rute ke `dispatch_log.csv` untuk ditampilkan di Peta Rute frontend.
- **Goal 8 — Clustering (inti inovasi: "pola buang antar toko"):**
  - [ ] Jalankan K-Means (5 baris Scikit-Learn) pada output simulasi untuk klaster toko berdasarkan waste rate & velocity.
  - [ ] Interpretasikan setiap klaster dengan narasi (misal: "Klaster A = toko dengan waste tinggi dan stok lambat").
  - [ ] Export hasil ke `output/cluster_results.csv`.

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

#### 🚀 UPGRADE Tasks
- [ ] Install `leaflet` + `react-leaflet`.
- [ ] Tambah **Tab "Peta Rute"** ke dashboard: plot marker penerima + polyline OSRM dari `dispatch_log` — **ini visualisasi dari "Missing Parts": bagaimana kita memilih food bank + jarak/ETA**.
- [ ] Tambah **Tab "Klaster Toko"**: scatter plot K-Means dari `cluster_results`.
- [ ] Tambah badge warna `waste_risk_score` di tabel Batch List (merah/kuning/hijau).

---

## Pekerjaan yang MEMANG Kena Bottleneck (Dikerjakan Nanti)

Pekerjaan berikut adalah satu-satunya bagian yang **harus menunggu** modul lain selesai:

### 🏗️ BASE Bottlenecks

| Pekerjaan yang Menunggu | Menunggu Apa? | Kapan Mulai? |
|---|---|---|
| **Step A2 BASE:** Upload `batches` ke Supabase | Output `canonical_batch_table.csv` dari Person 3 | Minggu ke-2/3 |
| **Koneksi frontend ke API asli** | API FastAPI Person 2 membaca Supabase asli | Akhir BASE phase |

### 🚀 UPGRADE Bottlenecks

| Pekerjaan yang Menunggu | Menunggu Apa? | Kapan Mulai? |
|---|---|---|
| **Goal 4 Full (Person 3):** Multi-dataset merge | Person 0 selesai DOSM lookup | Setelah BASE stabil |
| **Goal 5 (Person 5):** Waste-Risk model | Person 0 selesai imputasi 8K | Setelah BASE stabil |
| **Goal 8 (Person 5):** Clustering | Output CSV simulasi Goal 4 + Goal 7 | Setelah BASE stabil |
| **Step A2 UPGRADE:** Upload events/dispatch/clusters | Output penuh simulasi Step 12–14 | Setelah BASE stabil |
| **Tab Peta Rute (Person 6)** | Person 5 Goal 7 OSRM selesai, polyline tersedia | Setelah Upgrade dimulai |

---

## Kesimpulan Strategis

> **90% pekerjaan awal proyek ini adalah pekerjaan paralel.**
> Tidak ada alasan anggota tim berkata *"saya belum bisa mulai karena nunggu modul si X"*. Semua orang
> punya komponen BASE yang bisa langsung dikerjakan dan diuji sejak hari pertama menggunakan *dummy data*
> atau data mentah masing-masing.
>
> Upgrade bukan pekerjaan baru yang terpisah — Upgrade adalah **penyempurnaan** dari BASE yang sudah jalan.
> Dan sebagian besar Upgrade jauh lebih sederhana dari namanya. Yang penting BASE dulu.
