# PEMBAGIAN TUGAS KELOMPOK — DYNAMIC FOOD CLEARING HOUSE

> **Struktur Tim (Total 7 Anggota):**  
> • **1 Orang Dedicated:** Dataset Quality & Audit Engineer  
> • **6 Orang Pelaksana:** Eksekusi Goals 1 s/d 12

---

## 0. Panduan Baca: Dua Fase Pembangunan

Proyek ini dibangun dalam **dua fase** yang dirancang agar tidak ada kode yang dibuang:

```
╔══════════════════════════════════════════════════════════════════╗
║  🏗️  BASE  (Prioritas Utama — Target selesai sebelum UTS)       ║
║  Sistem 6-Langkah persis seperti di Alur_Penggunaan_Sistem.pdf  ║
║  → FEFO, Spoilage Risk, Demand Forecast, Aksi, Dashboard Toko   ║
╠══════════════════════════════════════════════════════════════════╣
║  🚀  UPGRADE  (Setelah Base berjalan stabil)                    ║
║  Tambah kecerdasan di BALIK LAYAR — UI tidak berubah sama sekali║
║  → Harga DOSM, Kalender MY, OSRM Routing, Clustering Toko       ║
╚══════════════════════════════════════════════════════════════════╝
```

> [!IMPORTANT]
> **Upgrade TIDAK merusak Base.** Tombol, layar, dan alur 6 langkah di PDF tetap sama persis. Yang berubah hanya "mesin" di belakangnya — semakin cerdas, semakin akurat, semakin berbobot di hadapan penguji.

---

## 1. Matriks Ringkasan Peran & Tanggung Jawab

| No | Anggota / Peran | Goals Base 🏗️ | Goals Upgrade 🚀 | Topik Presentasi |
|:---:|---|---|---|---|
| **0** | **Dataset Quality Specialist** | Typo + Null fix (2 tugas kecil) | Lookup DOSM, Kalender MY, Imputasi 8K rows | *Data Quality Engineering: Audit, Perbaikan, dan Harmonisasi Data Multi-Sumber* |
| **1** | **Tech Lead & ML Tabular (Anda)** | **Goal 1** (Spoilage Classifier) + Supervisi | Bantu cicil **Goal 8** (Clustering) jika Person 5 kelebihan beban | *Klasifikasi Spoilage Risk (FEFO) & Arsitektur Solusi Keseluruhan* |
| **2** | **Forecaster & API Engineer** | **Goal 2** (Forecast 3 hari) + **Goal 10** (FastAPI) | **Goal 2 Upgrade:** tambah fitur kalender libur MY dari Person 0 | *Time-Series Demand Forecasting & Layanan REST API* |
| **3** | **Data Architect & Simulator** | Pipeline data tunggal (1 dataset → model) + **Goal 4 Base** | **Goal 3** (Canonical Schema 5 dataset) + **Goal 4 Full** (Multi-source Simulator) | *Skema Data Kanonikal & Engine Simulator Multi-Sumber* |
| **4** | **Business Logic & Cloud DB** | **Goal 6 Base** (Rule Engine sederhana) + **Goal 9** (Supabase) | **Goal 6 Upgrade** (ReFED + Dynamic Pricing + Anti-Moral-Hazard + Kuota Donasi) | *Logika Bisnis Clearing House & Arsitektur Cloud Database* |
| **5** | **Risk, Routing & Analytics** | Siapkan daftar receiver + logika greedy dasar | **Goal 5** (Waste-Risk ML) + **Goal 7** (OSRM Dispatch) + **Goal 8** (Clustering) | *Waste-Risk Scoring, Optimasi Dispatch Rute, & Analisis Klaster Toko* |
| **6** | **Frontend & Visual Lead** | **Goal 11** (Dashboard Toko) + **Goal 12** (Admin) + Canva Polish | Tambah tab Peta Rute Donasi & Grafik Klaster ke dashboard jika Upgrade selesai | *Antarmuka Interaktif Real-Time & Konsistensi Desain Presentasi* |

---

## 2. Rincian Detail Tugas Tiap Anggota

---

### 👤 Person 0 — Dataset Quality Specialist

#### 🏗️ BASE — Wajib Diselesaikan di Minggu 1 (Hanya ~1 Jam Total)
- [ ] Rename kolom `Catagory` → `Category` di `Grocery_Inventory new v1.csv` *(1 baris Python)*.
- [ ] Isi nilai null Baris 574 (Cabbage) dengan `'Produce'` *(1 baris Python)*.
- [ ] Catat perubahan minimal di `dataset_fixes.md`.

#### 🚀 UPGRADE — Dikerjakan Setelah Base Stabil
> [!NOTE]
> Ketiga tugas ini terdengar rumit tapi **jauh lebih ringan dari kedengarannya**. Semuanya bisa selesai dalam 1–2 jam duduk.

- [ ] **Kalender Hari Libur Malaysia:** Buat file `holidays_my.csv` berisi ~20 tanggal merah nasional setahun (bisa dari situs *officeholidays.com* atau Google, lalu salin ke Excel/CSV). Tidak perlu otomasi — cukup tabel 2 kolom: `date`, `holiday_name`.
- [ ] **DOSM PriceCatcher Lookup:** Unduh `item.parquet` dan `premise.parquet` dari [open.dosm.gov.my](https://open.dosm.gov.my/data-catalogue/pricecatcher). Ini bukan dataset besar — cukup `pd.read_parquet()` lalu `merge` ke PriceCatcher CSV yang sudah ada.
- [ ] **Imputasi `food_waste_dataset.csv`:** Isi nilai kosong di 5 kolom (hanya ~2–3% dari 8.000 baris) menggunakan median/modus per kelompok. AI bisa generate kode ini dalam hitungan detik.

---

### 👤 Person 1 (Anda) — Tech Lead & ML Tabular

#### 🏗️ BASE
- [ ] **Goal 1:** Latih model Spoilage Risk Classifier (Random Forest/XGBoost) berbasis `days_to_expiry`, `turnover_ratio`, `stock_quantity`.
- [ ] Simpan ke `models/spoilage_classifier.pkl` dan buat fungsi inferensi `predict_spoilage_risk(lot_dict)`.
- [ ] Pastikan output fungsi berupa JSON: `{"label": "HIGH", "score": 0.87}` yang langsung bisa dikonsumsi backend.
- [ ] Pantau arah proyek agar sesuai `problem_statement.md` dan buka sesi konsultasi berkala.

#### 🚀 UPGRADE *(Taktik Cadangan — Dikerjakan jika Ada Waktu Luang)*
- [ ] Bantu Person 5 mencicil **Goal 8:** evaluasi elbow method + visualisasi scatter plot klaster toko.

---

### 👤 Person 2 — Forecaster & API Engineer

#### 🏗️ BASE
- [ ] **Goal 2 Base:** Eksplorasi `train.csv` M5, buat fitur lag (7, 14 hari) dan rolling mean.
- [ ] Latih model forecasting (LightGBM / Prophet) untuk prediksi demand **3 hari ke depan** per produk per toko.
- [ ] **Goal 10:** Inisialisasi FastAPI, buat endpoint awal: `GET /api/lots`, `GET /api/dashboard/summary`, `GET /api/forecast/{product_id}`.
- [ ] Aktifkan Swagger UI di `/docs` agar bisa langsung diuji tim.

#### 🚀 UPGRADE
- [ ] **Goal 2 Upgrade:** Terima file `holidays_my.csv` dari Person 0 → tambahkan kolom `is_holiday` ke training data → jalankan ulang training (~2 menit). Model kini peka terhadap lonjakan permintaan hari raya!

---

### 👤 Person 3 — Data Architect & Simulator

#### 🏗️ BASE
- [ ] **Pipeline Data Tunggal:** Bersihkan dan standardisasi format `Grocery_Inventory new v1.csv` menjadi skema dasar: `lot_id`, `product_name`, `category`, `quantity`, `expiry_date`, `store_id`.
- [ ] **Goal 4 Base:** Buat generator lot sederhana dari satu dataset (belum multi-sumber) → hasilkan `lots_base.csv` sebagai input simulator toko.

#### 🚀 UPGRADE
- [ ] **Goal 3 Full:** Satukan 5 dataset (Inventory + M5 + Food Waste + PriceCatcher + FAO) ke dalam skema kanonikal lengkap dengan mapping kategori dan normalisasi harga MYR.
- [ ] **Goal 4 Full:** Upgrade generator menjadi simulator multi-toko terkalibrasi yang menghasilkan `simulation_events.csv` penuh.

---

### 👤 Person 4 — Business Logic & Cloud DB Lead

#### 🏗️ BASE
- [ ] **Goal 6 Base (Rule Engine Sederhana):** Tulis fungsi `assign_route(days_to_expiry, quantity, demand_forecast)` dengan logika 3 cabang sederhana:
  - `days_to_expiry > 3` → `"Normal Sale"`
  - `1 < days_to_expiry ≤ 3` → `"Markdown"` (diskon flat 20%)
  - `days_to_expiry ≤ 1` → `"Donate"`
- [ ] **Goal 9:** Inisialisasi project Supabase, jalankan DDL 5 tabel inti, konfigurasikan RLS.

#### 🚀 UPGRADE
> [!NOTE]
> Upgrade Rule Engine terdengar berat, tapi kode tambahannya hanya memperluas `if/elif` di `assign_route()`. Bukan menulis ulang dari nol!

- [ ] **Goal 6 Upgrade:** Perluas `assign_route()` berdasarkan taksonomi 10 destinasi ReFED:  
  `Normal Sale` → `Dynamic Pricing` *(harga berbasis PriceCatcher dari Person 0)* → `Commercial B2B` → `Donation` *(dengan kuota maksimal & cek reputasi donor)* → `Animal Feed / Composting`.
- [ ] Tambahkan anti-moral-hazard: track rasio donasi per donor, tolak jika melebihi kuota.

---

### 👤 Person 5 — Risk, Routing & Analytics Lead

#### 🏗️ BASE
- [ ] Buat daftar 10–20 penerima fiktif realistis (food bank / pantry di Lembah Klang) dalam format CSV: `receiver_id`, `name`, `lat`, `lng`, `capacity`, `accepted_categories`.
- [ ] Tulis fungsi greedy matching dasar: urutkan penerima berdasarkan jarak terdekat ke donor *(hitung jarak Euclidean dulu jika belum ada OSRM)*.

#### 🚀 UPGRADE
> [!NOTE]
> Jangan bayangkan ini seperti membangun Google Maps! Ketiga upgrade ini **jauh lebih simpel dari kesan pertamanya**:
> - **OSRM** = 1 baris `requests.get("http://router.project-osrm.org/...")` → dapat jarak & ETA.
> - **K-Means** = 5 baris Scikit-Learn: `KMeans(n_clusters=3).fit(df)`.
> - **Waste-Risk** = standard ML tabular training seperti yang dilakukan Person 1 & 2.

- [ ] **Goal 7 Upgrade:** Ganti jarak Euclidean dengan **API OSRM** untuk jarak riil & durasi pengiriman. Tambahkan constraint kategori penerima (food bank tertentu tidak menerima produk daging).
- [ ] **Goal 5:** Latih model **Waste-Risk Scoring** menggunakan `food_waste_dataset.csv` (8K baris dari Person 0) → output skor probabilitas 0–100% untuk tiap lot.
- [ ] **Goal 8:** Jalankan **K-Means clustering** pada profil agregat toko (waste_rate, clearance_speed) → interpretasikan klaster dan tulis `cluster_report.md` *(dibantu Person 1 jika perlu)*.

---

### 👤 Person 6 — Frontend & Visual Lead

#### 🏗️ BASE
- [ ] **Goal 11:** Inisialisasi frontend (Next.js / Streamlit + Tailwind CSS).
- [ ] Bangun 6 langkah antarmuka persis seperti di `Alur_Penggunaan_Sistem.pdf`:
  - Tampilan lot stok FEFO (badge *Pick First*, warna risiko LOW/MODERATE/HIGH).
  - Grafik prediksi demand 3 hari ke depan.
  - Tombol rekomendasi aksi: **Markdown / Bundle / Donate** + tombol Setuju/Tolak staf.
  - KPI Cards dashboard: Clearance Rate, Lot Terselamatkan (kg), Prediksi Waste.
- [ ] **Goal 12:** Bangun halaman Admin `/admin` dengan login Supabase Auth dan tabel manajemen lot/penerima.
- [ ] **Visual Lead:** Koordinasikan template slide Canva (palet warna, tipografi, layout) untuk seluruh anggota tim.

#### 🚀 UPGRADE *(Dipasang Setelah Upgrade Backend Selesai)*
- [ ] Tambahkan **Tab Peta Rute Donasi** (Leaflet / Mapbox): visualisasi garis donor ↔ food bank terpilih beserta ETA dari OSRM.
- [ ] Tambahkan **Tab Klaster Toko** di dashboard: scatter plot profil toko dari hasil K-Means Person 5.

---

## 3. Timeline Dua Fase

| Fase | Target Minggu | Milestone |
|---|---|---|
| 🏗️ **BASE selesai** | Minggu 4–7 (sebelum UTS) | Sistem 6-langkah di PDF berjalan end-to-end, ada demo produk nyata |
| 🚀 **UPGRADE dimulai** | Minggu 8–11 | Person 0 selesai 3 dataset Upgrade, tim masing-masing colokkan ke sistem |
| 🏆 **UPGRADE selesai** | Minggu 12–13 | Platform lengkap: OSRM Routing, Clustering, Dynamic Pricing MYR |
| 📋 **Presentasi Akhir** | Minggu 14 | Demo sistem + laporan + video |

---

## 4. Aturan Kerja & Kolaborasi

1. **Zero-Waiting Day 1:** Lihat `INDEPENDENT_TASKS.md` — semua orang bisa mulai hari ini tanpa menunggu modul lain.
2. **Laporan & Presentasi Sendiri:** Setiap anggota menulis bagian laporan dan slide dari Goal yang mereka kerjakan.
3. **Kolom Database Disiapkan Sejak Base:** Person 4 wajib membuat tabel Supabase dengan kolom `waste_risk_score`, `receiver_id`, dan `market_price_myr` sejak awal (biarkan `NULL` dulu). Kolom ini yang akan diisi saat Upgrade masuk.
4. **Format API Jangan Diubah:** Person 2 wajib menjaga format response JSON tidak berubah saat Upgrade. Frontend (Person 6) tidak perlu menyentuh kodenya sama sekali saat kecerdasan backend ditingkatkan.
