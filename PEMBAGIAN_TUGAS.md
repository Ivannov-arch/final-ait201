# PEMBAGIAN TUGAS KELOMPOK — DYNAMIC FOOD CLEARING HOUSE

> **Struktur Tim (Total 7 Anggota):**  
> • **1 Orang Dedicated:** Dataset Quality & Localization Specialist (Person 0)  
> • **6 Orang Pelaksana Teknis:** Eksekusi ML, Backend, Database, GIS/Routing, & Frontend (Person 1–6)

---

## 0. Panduan Baca: Dua Fase Pembangunan (Rebalanced)

Proyek ini dirancang agar setiap anggota tim memiliki bobot kerja yang **solid, seimbang, dan berbobot akademis sejak Fase 1 (Base)**, dengan kelanjutan yang mulus ke Fase 2 (Upgrade):

```
╔════════════════════════════════════════════════════════════════════════════╗
║  🏗️  BASE (Fase 1: Prioritas Utama — Demo Solid, Lengkap, & Berbobot)       ║
║  Sistem Toko 6-Langkah Sesuai PDF + Data Riil Malaysia + Visualisasi GIS   ║
║  → FEFO, Spoilage ML, Forecast Libur MY, Dynamic Markdown DOSM,            ║
║    Waste-Risk ML, OSRM Smart Dispatch, Peta Rute Interaktif (Leaflet JS)   ║
╠════════════════════════════════════════════════════════════════════════════╣
║  🚀  UPGRADE & 💡 OPSIONAL (Fase 2: Ekspansi Skala — Multi-Toko & BI)      ║
║  Ekspansi dari 1 Toko menjadi Jaringan Multi-Cabang & Analitik Makro       ║
║  → Simulator Multi-Toko (Event Stream), ReFED 10-Jalur Penuh,              ║
║    K-Means Clustering Toko & Deteksi Anomali Pemborosan                    ║
╚════════════════════════════════════════════════════════════════════════════╝
```

---

## 1. Matriks Pembagian Tugas (Dua Fase Berkelanjutan)

---

### 📋 TABEL 1: Pembagian Tugas 🏗️ BASE (Fase 1: Prioritas Utama)
> **Fokus:** Merealisasikan alur 6-langkah sesuai `Alur_Penggunaan_Sistem.pdf` menjadi sistem nyata yang berbobot: didukung data pasar riil Malaysia, model ML ganda, dan visualisasi rute interaktif Leaflet JS.

| No | Anggota & Peran | Goal BASE | Deliverable Utama BASE | Deskripsi Pekerjaan BASE | Kompleksitas |
|:---:|---|:---:|---|---|:---:|
| **0** | **Dataset Quality & Localization** | Data Prep & Audit | Paket Dataset Bersih & Terlokalisasi Malaysia | Perbaiki typo `Catagory` & null Cabbage; susun kalender libur nasional Malaysia (`holidays_my.csv`); unduh lookup DOSM PriceCatcher (`item.parquet`); serta imputasi 5 kolom null di `food_waste_dataset.csv` 8K. | 🔄 Sedang (Data Cleaning & Mapping) |
| **1** | **Tech Lead & ML Tabular (Anda)** | **Goal 1** | Model `spoilage_classifier.pkl` + FEFO Sorter | Feature engineering `days_to_expiry` & `turnover_ratio`, klasifikasi risiko kadaluarsa LOW/MODERATE/HIGH (Langkah 1 & 2 PDF) + supervisi arsitektur & integrasi sistem tim. | ⚡ Ringkas dengan AI |
| **2** | **Forecaster & API Engineer** | **Goal 2 & 10** | Model `demand_forecast.pkl` + REST API FastAPI | Latih model peramalan permintaan 3 hari (M5) dengan fitur kalender libur Malaysia dari Person 0 (Langkah 3 PDF) + bangun server FastAPI (endpoint lots, forecast, recommend, route OSRM, summary). | 🧠 Manual-Heavy (Tuning Time-Series) |
| **3** | **Data Architect & Pipeline** | **Goal 4 Base** | Script Pipeline Toko Tunggal + `lots_base.csv` | Tulis script ETL Python (`etl/process_store_inventory.py`) yang mengolah inventaris mentah 1 dataset toko (`Grocery_Inventory`) menjadi `lots_base.csv` berformat standar, siap dikonsumsi Supabase dan dashboard. | ⚡ Ringkas dengan AI |
| **4** | **Business Logic & Cloud DB** | **Goal 6 Base+ & 9** | Rule Engine Dynamic Markdown + Supabase Cloud DB | Bangun logika `assign_route()` berbasis harga acuan pasar DOSM MYR dan hari kadaluarsa (Langkah 4 PDF); terapkan segregasi donasi tertutup (*anti-moral-hazard pembeli*) + setup 5 tabel PostgreSQL & RLS Supabase. | ⚡ Ringkas dengan AI |
| **5** | **Risk & Smart Dispatch Lead** | **Goal 5 & 7** | Model `waste_risk_model.pkl` + OSRM Dispatch Engine | Latih model probabilitas waste dari data 8K Person 0; susun daftar food bank Lembah Klang; integrasikan **API OSRM (1 baris HTTP GET)** untuk menghitung jarak km, durasi ETA, dan **polyline rute jalan riil** (Langkah 5 PDF). | 🔄 Mixed (ML Tabular + API GIS) |
| **6** | **Frontend, GIS & Visual Lead** | **Goal 11 & 12 + GIS** | Dashboard Toko 6-Langkah + **Peta Rute Leaflet JS** + Admin | Bangun web app 6-langkah toko PDF; **pasang peta interaktif Leaflet JS** (plot lokasi supermarket, marker food bank terpilih, garis rute polyline jalan riil OSRM + estimasi waktu); panel admin; dan template Canva tim. | 🔄 Mixed (UI Komponen + Leaflet GIS) |

---

### 🚀 TABEL 2: Pembagian Tugas UPGRADE & OPSIONAL (Fase 2: Ekspansi Skala)
> **Fokus:** Mengembangkan sistem dari level toko tunggal menjadi ekosistem simulasi multi-cabang terintegrasi (*Clearing House Scale*) dan analitik komparasi makro.

| No | Anggota & Peran | Kelanjutan dari BASE | Goal UPGRADE (Skala Multi-Toko) | Goal OPSIONAL (Stretch Goals) | Deskripsi Pekerjaan Lanjutan & Dampak Sistem |
|:---:|---|---|:---:|:---:|---|
| **0** | **Dataset Quality Specialist** | Melanjutkan tata kelola data untuk multi-region | Data Audit Multi-Store & Scraping DOSM Lanjutan | — | Memperkaya data pembanding harga antar-wilayah (Selangor, KL, Penang) untuk simulasi disparitas harga pangan. |
| **1** | **Tech Lead & ML Tabular (Anda)** | Mengawasi evaluasi model & simulasi clearing house | Evaluasi Model Ensemble & Validasi Clearing House | Dampingi interpretasi **Goal 8** | Menguji ketahanan model saat volume surplus melonjak; menyusun bab metodologi dan arsitektur pada laporan akhir/makalah. |
| **2** | **Forecaster & API Engineer** | Memperluas API toko tunggal ke API multi-cabang | Forecast Multi-Store + Endpoint Telemetri | — | Menambahkan parameter `store_id` pada endpoint forecasting dan menyediakan endpoint streaming telemetri simulasi. |
| **3** | **Data Architect & Pipeline** | Memperluas ETL tunggal ke canonical schema + simulator multi-toko | **Goal 3** (Canonical Schema 5 Dataset) + **Goal 4 Full** (Multi-Source Simulator Engine) | — | **Goal 3:** Harmonisasi 5 dataset riil (Grocery, M5, Food Waste, PriceCatcher DOSM) ke satu skema kanonikal `canonical_batch_table.csv`. **Goal 4 Full:** Bangun engine simulasi multi-toko berbasis event loop → `simulation_events.csv` (event: `received`, `active_fefo`, `markdown`, `dispatched`, `wasted`). |
| **4** | **Business Logic & Cloud DB** | Memperluas jalur donasi ke taksonomi surplus lengkap | **Goal 6 Full** (ReFED 10-Destinasi Lengkap) | — | Menambahkan jalur surplus non-manusia: pengalihan ke pakan ternak (*animal feed*), industri kompos, dan mekanisme lelang B2B wholesale. |
| **5** | **Risk & Smart Dispatch Lead** | Dari rute titik-ke-titik ke optimasi analitik toko | Optimasi Multi-Drop Dispatch | **Goal 8** (K-Means Clustering Toko & Produk) | **Upgrade:** Dispatch gabungan (1 armada mengambil dari 2 toko terdekat). **Opsional (Stretch):** Segmentasi toko K-Means (5 baris Sklearn) berdasarkan pola pemborosan untuk laporan. |
| **6** | **Frontend, GIS & Visual Lead** | Dari peta 1 toko ke peta jaringan multi-cabang | Peta Jaringan Multi-Toko (Leaflet Multi-Layer) | **Tab Klaster Toko** (Scatter Plot) | **Upgrade:** Menampilkan seluruh armada dispatch aktif di peta Leaflet. **Opsional (Stretch):** Visualisasi scatter plot klaster toko untuk slide presentasi. |

---

## 2. Rincian Detail Tugas Tiap Anggota (Fase BASE)

---

### 👤 Person 0 — Dataset Quality & Localization Specialist
- [ ] Rename kolom `Catagory` → `Category` di `Grocery_Inventory new v1.csv`.
- [ ] Isi nilai null baris 574 Cabbage dengan `'Produce'`.
- [ ] Buat file `holidays_my.csv` berisi ~20 tanggal merah nasional Malaysia setahun (untuk Goal 2).
- [ ] Unduh tabel lookup PriceCatcher DOSM (`item.parquet` dan `premise.parquet`) dari open.dosm.gov.my (untuk Goal 6).
- [ ] Lakukan imputasi group-median pada 5 kolom null di `food_waste_dataset.csv` (8K baris) (untuk Goal 5).
- [ ] Dokumentasikan hasil di `dataset_fixes.md` dan distribusikan file bersih ke folder `data/`.

---

### 👤 Person 1 (Anda) — Tech Lead & ML Tabular
- [ ] Exploratory Data Analysis (EDA) distribusi kedaluwarsa dan perputaran stok di `Grocery_Inventory`.
- [ ] Feature engineering: hitung `days_to_expiry` dan `turnover_ratio`.
- [ ] Latih model klasifikasi spoilage risk (`HIGH`, `MEDIUM`, `LOW`) dengan Random Forest / XGBoost.
- [ ] Evaluasi model (F1-Score, Confusion Matrix) dan simpan ke `models/spoilage_classifier.pkl`.
- [ ] Buat fungsi urutan FEFO: `sort_by_fefo(batch_list)`.
- [ ] Supervisi arsitektur data, API contract, dan alur integrasi seluruh modul tim.

---

### 👤 Person 2 — Forecaster & API Engineer
- [ ] Load data time-series penjualan `train.csv` (M5).
- [ ] Gabungkan kalender hari libur Malaysia `holidays_my.csv` dari Person 0 sebagai fitur `is_holiday`.
- [ ] Buat lag features (lag-7, lag-14, rolling mean penjualan).
- [ ] Latih model forecasting (LightGBM) untuk prediksi permintaan 3 hari ke depan per produk.
- [ ] Simpan model ke `models/demand_forecast.pkl`.
- [ ] Bangun server FastAPI (`backend/main.py`) dengan endpoint:
  - `GET /api/lots` (daftar stok FEFO)
  - `GET /api/forecast/{product_id}` (prediksi demand 3 hari)
  - `POST /api/recommend` (rekomendasi aksi diskon/donasi)
  - `GET /api/dispatch-route/{batch_id}` (rute OSRM & polyline jalan)
  - `GET /api/dashboard/summary` (KPI agregat)
- [ ] Konfigurasi CORS dan Swagger docs di `/docs`.

---

### 👤 Person 3 — Data Architect & Pipeline
- [ ] Tetapkan format kolom standar untuk `lots_base.csv`: `lot_id`, `product_name`, `category`, `quantity`, `expiry_date`, `unit_price_myr` *(hanya untuk 1 dataset ini — Canonical Schema multi-dataset adalah UPGRADE)*.
- [ ] Tulis script ETL Python (`etl/process_store_inventory.py`) untuk membersihkan dan menstandarisasi inventaris toko.
- [ ] Ekspor file `lots_base.csv` yang terkalibrasi dan siap di-load oleh Supabase.
- [ ] Buat script validasi integritas data (tidak ada tanggal kadaluarsa negatif, tidak ada kuantitas null).

---

### 👤 Person 4 — Business Logic & Cloud Database
- [ ] **Rule Engine Dynamic Markdown (Goal 6 Base+):**
  - Baca harga referensi pasar komoditas MYR dari file DOSM Person 0.
  - Implementasikan fungsi `assign_route(days_to_expiry, quantity, forecast_demand)`:
    - *Stok aman:* `Normal Sale` (harga penuh).
    - *Stok surplus & umur 2–4 hari:* `Dynamic Markdown` (diskon bertahap 15%–40% berbasis harga pasar DOSM).
    - *Stok surplus & umur ≤ 1 hari:* `Donation` (dialihkan ke mitra food bank).
  - Terapkan aturan *Anti-Moral-Hazard Pembeli*: donasi dilakukan tertutup ke food bank resmi dan dibatasi kuota maksimal 30% dari surplus.
- [ ] **Database Supabase (Goal 9):**
  - Buat project di Supabase dan buat 5 tabel PostgreSQL (`batches`, `simulation_events`, `dispatch_log`, `receivers`, `cluster_results`).
  - Terapkan Row Level Security (RLS) dan buat view ringkasan dashboard `v_dashboard_summary`.

---

### 👤 Person 5 — Risk & Smart Dispatch Lead
- [ ] **Model Waste-Risk Scoring (Goal 5):**
  - Latih model ML (Random Forest/Logistic Regression) pada dataset `food_waste_dataset.csv` 8K hasil imputasi Person 0.
  - Hasilkan estimasi probabilitas numerik (0–100%) suatu lot akan terbuang dalam berapa jam.
  - Simpan ke `models/waste_risk_model.pkl`.
- [ ] **Smart Dispatch & OSRM Engine (Goal 7):**
  - Buat file `receivers_list.csv` (10–20 food bank, panti asuhan, dan dapur umum di Lembah Klang lengkap dengan lat/lng dan kapasitas).
  - Buat fungsi matching seleksi penerima: cari food bank terdekat dengan kapasitas mencukupi.
  - Panggil API OSRM publik via HTTP GET:
    `requests.get(f"http://router.project-osrm.org/route/v1/driving/{lon_store},{lat_store};{lon_bank},{lat_bank}?overview=full&geometries=geojson")`
  - Ekstrak: `distance_km`, `eta_minutes`, dan `geometry_coordinates` (polyline rute jalan riil).
  - Simpan log pengiriman ke `dispatch_log.csv`.

---

### 👤 Person 6 — Frontend, GIS & Visual Lead
- [ ] Inisialisasi web app Next.js / Streamlit + Tailwind CSS.
- [ ] Bangun antarmuka toko 6-langkah sesuai PDF:
  1. Tabel inventaris FEFO dengan badge prioritas *Pick First*.
  2. Indikator risiko kadaluarsa (warna & skor probabilitas waste dari Person 5).
  3. Grafik peramalan demand 3 hari (Recharts / Chart.js).
  4. Kartu rekomendasi aksi (Markdown harga DOSM / Donasi).
  5. **Visualisasi Peta Interaktif Leaflet JS:**
     - Plot marker lokasi supermarket (asal).
     - Plot marker lokasi food bank terpilih (tujuan).
     - Gambar polyline rute jalan riil dari GeoJSON OSRM.
     - Tampilkan popup informasi: Jarak (km), Estimasi Waktu Tempuh (ETA menit), dan Jam Pengambilan.
  6. Dashboard KPI: Lot terselamatkan (kg), Clearance Rate (%), Estimasi Nilai Rupiah/Ringgit yang diselamatkan.
- [ ] Bangun halaman Admin `/admin` dengan login Supabase Auth.
- [ ] Desain template presentasi resmi tim di Canva.
