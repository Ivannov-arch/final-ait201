# Daftar Pekerjaan Bebas Bottleneck (Day 1 Independent Tasks)

> **Dynamic Food Clearing House Simulator**  
> Dokumen ini memetakan seluruh pekerjaan yang **TIDAK TERGANTUNG pada orang lain/pekerjaan lain**.  
> Semua task di bawah ini bisa langsung dieksekusi sejak **Hari Pertama (Day 1)** tanpa perlu menunggu modul lain selesai.

---

## Ringkasan: Siapa Bisa Langsung Kerja Apa?

| Peran | Penanggung Jawab | Task Bebas Bottleneck (Bisa Langsung Dikerjakan) | Ketergantungan |
|---|---|---|:---:|
| **Dataset Engineer** | Person 0 | Perbaikan semua isu di `dataset_audit.md` (typo, imputasi, download lookup DOSM & kalender MY) | **0% (Mandiri)** |
| **ML Tabular Lead** | Person 1 (Kamu) | **Goal 1:** EDA, feature engineering, training model Spoilage Classifier (`.pkl`) & evaluasi akurasi | **0% (Mandiri)** |
| **Forecaster & API** | Person 2 | **Goal 2:** Baseline Demand Forecasting (M5) + **Goal 10:** Scaffold FastAPI & mock endpoints | **0% (Mandiri)** |
| **Data Architect** | Person 3 | **Goal 3 (Fase Desain):** Perumusan draft Canonical Schema & kamus mapping antar-kategori | **0% (Mandiri)** |
| **Logic & Database** | Person 4 | **Goal 6:** Coding modul Rule Engine ReFED + **Goal 9:** Setup project Supabase, DDL tabel, & RLS | **0% (Mandiri)** |
| **Risk & Dispatch** | Person 5 | **Goal 5 (Model):** Training Waste-Risk Classifier + **Goal 7:** Setup koordinat receiver & tes API OSRM | **0% (Mandiri)** |
| **Frontend & Design** | Person 6 | **Goal 11 & 12:** Setup Next.js/Streamlit, layout UI dashboard/admin dengan mock data + Canva theme | **0% (Mandiri)** |

---

## Rincian Pekerjaan Mandiri per Orang

### 1. Person 0 — Dataset Quality Engineering (100% Mandiri)
Tidak memerlukan kode atau output dari siapapun. Langsung bekerja pada file mentah:
- [ ] Rename kolom `Catagory` → `Category` di `Grocery_Inventory new v1.csv`.
- [ ] Isi nilai null baris 574 Cabbage dengan `'Produce'`.
- [ ] Unduh tabel lookup DOSM (`item.parquet` dan `premise.parquet`) dari portal OpenDOSM.
- [ ] Siapkan file CSV kalender hari libur nasional Malaysia (substitusi libur Ekuador).
- [ ] Lakukan imputasi group-median pada 5 kolom null di `food_waste_dataset.csv` (8K rows).
- [ ] Dokumentasikan hasil perbaikan di `dataset_fixes.md`.

---

### 2. Person 1 (Kamu) — Goal 1: Spoilage & FEFO Classifier (100% Mandiri)
Dataset sudah tersedia di folder lokal (`Grocery Inventory` / `perishable_goods_management.csv`):
- [ ] Lakukan Exploratory Data Analysis (EDA) distribusi kedaluwarsa dan perputaran stok.
- [ ] Feature engineering: hitung `days_to_expiry` dan `turnover_ratio`.
- [ ] Buat label risiko kerusakan (`HIGH`, `MEDIUM`, `LOW`).
- [ ] Latih model klasifikasi (Random Forest / XGBoost) dengan Scikit-Learn.
- [ ] Evaluasi performa (Confusion Matrix, F1-Score) dan simpan model ke `models/spoilage_classifier.pkl`.
- [ ] Buat fungsi inferensi mandiri: `predict_spoilage_risk(batch_dict)`.

---

### 3. Person 2 — Goal 2 (Forecasting) & Goal 10 (API Skeleton) (100% Mandiri)
Dua pekerjaan ini sama sekali tidak menunggu pipeline selesai:
- **Bagian Forecasting (Goal 2):**
  - [ ] Load data `train.csv` dan `transactions.csv` dari folder `8. store-sales-time-series-forecasting/`.
  - [ ] Buat pipeline time-series baseline (lag-7, lag-14, rolling mean penjualan).
  - [ ] Latih model baseline forecasting (LightGBM / Prophet).
- **Bagian Backend API (Goal 10):**
  - [ ] Inisialisasi struktur folder FastAPI (`routers/`, `schemas/`, `services/`).
  - [ ] Buat skema Pydantic untuk request/response.
  - [ ] Buat endpoint dummy yang mengembalikan JSON tiruan (`GET /api/batches`, `GET /api/dashboard/summary`).
  - [ ] Pastikan dokumentasi Swagger di `http://localhost:8000/docs` sudah bisa diakses dan dites.

---

### 4. Person 3 — Goal 3: Desain Canonical Schema (100% Mandiri di Awal)
Sebelum menulis fungsi merge data besar, tahap desain kontrak data bisa langsung dikerjakan:
- [ ] Buka sampel 5 baris dari tiap dataset (Inventory, M5, Food Waste, PriceCatcher).
- [ ] Susun tabel mapping padanan kategori (misal: `Produce` ↔ `FOODS_1` ↔ `Sayur`).
- [ ] Tetapkan nama kolom baku (kontrak skema) di dokumen/Excel.
- [ ] Tentukan standar format tanggal (`YYYY-MM-DD`) dan konversi harga ke MYR.

---

### 5. Person 4 — Goal 6 (Rule Engine) & Goal 9 (Database Supabase) (100% Mandiri)
Logika bisnis dan struktur database bisa dibangun dengan mock data:
- **Bagian Rule Engine (Goal 6):**
  - [ ] Pelajari taksonomi 10 destinasi surplus ReFED.
  - [ ] Tulis logika murni Python `assign_route(days_to_expiry, risk_score, price)`.
  - [ ] Implementasikan rumus dynamic pricing (penurunan harga bertahap).
  - [ ] Implementasikan aturan kuota donasi maksimal (anti-moral-hazard).
  - [ ] Buat unit test sederhana dengan 5 contoh dictionary batch dummy.
- **Bagian Cloud Database (Goal 9):**
  - [ ] Buat project baru di [supabase.com](https://supabase.com).
  - [ ] Eksekusi skrip DDL SQL untuk membuat 5 tabel (`batches`, `simulation_events`, `dispatch_log`, `receivers`, `cluster_results`).
  - [ ] Konfigurasi hak akses Row Level Security (RLS).

---

### 6. Person 5 — Goal 5 (Model Training) & Goal 7 (Routing Setup) (100% Mandiri)
- **Bagian Model Waste-Risk (Goal 5):**
  - [ ] Gunakan `food_waste_dataset.csv` (8.000 baris).
  - [ ] Latih model klasifikasi/regresi untuk memprediksi probabilitas waste.
  - [ ] Simpan model ke `models/waste_risk_model.pkl`.
- **Bagian Routing & Dispatch (Goal 7):**
  - [ ] Buat daftar 10–20 penerima fiktif realistis di area Lembah Klang/Malaysia (nama, alamat, kapasitas).
  - [ ] Tes integrasi API Nominatim untuk mengubah alamat menjadi titik koordinat lintang/bujur (lat/long).
  - [ ] Tes pemanggilan API OSRM publik untuk menghitung jarak tempuh (km) dan durasi (ETA).
  - [ ] Tulis fungsi seleksi greedy: memilih penerima dengan skor `jarak terdekat + kapasitas cukup`.

---

### 7. Person 6 — Goal 11 & 12 (Frontend UI) + Design Template (100% Mandiri)
Frontend modern tidak perlu menunggu backend selesai berkat teknik *mocking*:
- [ ] Inisialisasi project Next.js / Streamlit + Tailwind CSS.
- [ ] Buat komponen statis KPI Cards (Total Batch Diselamatkan, Rasio Waste, dll.).
- [ ] Buat komponen visualisasi grafik (Recharts / Chart.js) menggunakan data JSON dummy.
- [ ] Pasang peta interaktif (Leaflet / Mapbox) dan plot beberapa marker lokasi dummy.
- [ ] Buat layout halaman Admin `/admin` dengan proteksi form login Supabase Auth.
- [ ] Buat template slide presentasi di Canva (menentukan palet warna, tipografi, dan layout konsisten).

---

## Pekerjaan yang MEMANG Kena Bottleneck (Dikerjakan Nanti)

Pekerjaan berikut adalah satu-satunya bagian yang **harus menunggu** modul lain selesai:

| Pekerjaan yang Menunggu | Menunggu Apa? | Kapan Mulai? |
|---|---|---|
| **Goal 4:** Menjalankan eksekusi Simulator Batch penuh | Menunggu **Goal 3** (Canonical Schema final) | Minggu ke-2/3 |
| **Integrasi Goal 5 ke Simulator** | Menunggu **Goal 4** (Event stream batch berjalan) | Minggu ke-3/4 |
| **Goal 8:** Eksekusi Clustering & Analisis Klaster Toko | Menunggu output CSV hasil simulasi (**Goal 4 & 7**) | Minggu ke-4/5 |
| **Step A2:** Upload otomatis CSV riil ke Supabase | Menunggu file CSV hasil simulasi tersedia | Minggu ke-4/5 |
| **Koneksi Frontend ke Backend Asli** | Menunggu API FastAPI membaca database asli | Tahap akhir integrasi |

---

## Kesimpulan Strategis

> **90% pekerjaan awal proyek ini adalah pekerjaan paralel.**  
> Tidak ada alasan anggota tim berkata *"saya belum bisa mulai karena nunggu modul si X"*. Semua orang punya komponen mandiri yang bisa langsung dikerjakan dan diuji sejak hari pertama menggunakan *dummy data* atau data mentah masing-masing.

