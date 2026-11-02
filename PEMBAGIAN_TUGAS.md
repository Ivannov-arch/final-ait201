# PEMBAGIAN TUGAS KELOMPOK — DYNAMIC FOOD CLEARING HOUSE

> **Struktur Tim (Total 7 Anggota):**  
> • **1 Orang Dedicated:** Dataset Quality & Audit Engineer  
> • **6 Orang Pelaksana:** Eksekusi Goals 1 s/d 12 (ML, Logic, Database, API, Frontend, & Visual)

---

## 1. Matriks Ringkasan Peran & Tanggung Jawab

| No | Anggota / Peran | Goals yang Dipegang | Bobot & Tipe | Deliverable Utama | Topik Bahasan Presentasi |
|:---:|---|---|:---:|---|---|
| **0** | **Dataset Quality Specialist** | Perbaikan Masalah Dataset | 🟡 Medium | Dataset bersih, lookup DOSM, kalender libur MY, `dataset_fixes.md` | *Data Quality Engineering: Audit, Imputasi, dan Harmonisasi Data Multi-Sumber* |
| **1** | **Tech Lead & ML Tabular (Anda)** | **Goal 1** (FEFO & Spoilage) + Monitoring Proyek | 🟢 Ringan (Koding) + 🟡 Supervisi | Model classifier (`.pkl`), integrasi pipeline, pendampingan Person 5 | *Sistem Klasifikasi Spoilage Risk (FEFO) & Arsitektur Solusi Dynamic Clearing House* |
| **2** | **Forecaster & API Engineer** | **Goal 2** (Demand Forecast) + **Goal 10** (FastAPI) | 🧠 Heavy + ⚡ Fast | Model Time-Series forecasting (`.pkl`) & server REST API (`/docs`) | *Pemodelan Time-Series Demand Forecasting & Penyediaan Layanan REST API* |
| **3** | **Data Architect & Simulator** | **Goal 3** (Canonical Schema) + **Goal 4** (Simulator Engine) | 🧠 Heavy + ⚡ Fast | `canonical_batch_table.csv` & engine event stream `simulation_events.csv` | *Desain Skema Data Kanonikal & Engine Simulator Aliran Batch Pangan* |
| **4** | **Business Logic & Cloud DB** | **Goal 6** (Rule Engine) + **Goal 9** (Database Supabase) | 🧠 Heavy + ⚡ Fast | Modul `assign_route()`, DDL PostgreSQL Supabase, & script ETL | *Logika Bisnis Clearing House ReFED & Arsitektur Cloud Database Supabase* |
| **5** | **Risk, Routing & Analytics** | **Goal 5** (Risk Score) + **Goal 7** (Dispatch) + **Goal 8** (Cluster) | 🔄 Mixed × 3 *(Didukung Person 1)* | Model waste-risk, routing OSRM `dispatch_log.csv`, & `cluster_report.md` | *Algoritma Waste-Risk Scoring, Optimasi Dispatch Rute, & Analisis Klastering Toko* |
| **6** | **Frontend & Visual Lead** | **Goal 11** (Dashboard) + **Goal 12** (Admin Page) + Canva Polish | ⚡ Fast × 2 + 🎨 Design | Web Dashboard publik, CMS Admin terproteksi Auth, & Slide Canva final | *Pengembangan Antarmuka Interaktif Real-Time & Konsistensi Desain Presentasi* |

---

## 2. Rincian Detail Tugas Tiap Anggota

### 👤 Person 0 — Dataset Quality Specialist
Fokus membersihkan semua kejanggalan data mentah sebelum dipakai oleh tim.
- [ ] Rename kolom `Catagory` → `Category` di `Grocery_Inventory new v1.csv`.
- [ ] Mengisi nilai null Baris 574 (Cabbage) dengan `'Produce'`.
- [ ] Mengunduh tabel lookup DOSM (`item.parquet` dan `premise.parquet`) untuk menerjemahkan kode PriceCatcher.
- [ ] Menyiapkan file CSV kalender libur nasional Malaysia (menggantikan libur Ekuador).
- [ ] Melakukan imputasi median/modus pada 5 kolom bolong di `food_waste_dataset.csv` (8K rows).
- [ ] Menjadikan dataset 8K rows sebagai dataset utama dan mendemotasi dataset 1K rows yang ternormalisasi.
- [ ] Menulis rangkuman perbaikan di `dataset_fixes.md`.

---

### 👤 Person 1 (Anda) — Tech Lead & ML Tabular
Memegang modul mandiri yang cepat beres, sekaligus memantau arsitektur dan menjadi jaring pengaman tim.
- [ ] **Goal 1:** Melatih model Spoilage Risk Classifier (Random Forest/XGBoost) berbasis `days_to_expiry` dan `turnover_ratio`.
- [ ] Menyimpan model ke `models/spoilage_classifier.pkl` dan membuat fungsi inferensi `predict_spoilage_risk()`.
- [ ] Menjaga arah proyek agar sesuai dengan dokumen `problem_statement.md`.
- [ ] Membuka sesi konsultasi berkala untuk anggota tim yang mengalami hambatan logika.
- [ ] **Taktik Cadangan:** Membantu Person 5 mencicil visualisasi dan evaluasi klastering di **Goal 8** jika beban Person 5 mulai menumpuk.

---

### 👤 Person 2 — Forecaster & API Engineer
Kombinasi pekerjaan riset analitik mendalam dengan implementasi backend standar.
- [ ] **Goal 2:** Eksplorasi data penjualan M5 (`train.csv`, `transactions.csv`).
- [ ] Feature engineering time-series (lag 7, lag 14, rolling mean penjualan harian).
- [ ] Melatih model forecasting (LightGBM / Prophet) untuk memprediksi volume demand toko ke depan.
- [ ] **Goal 10:** Menyiapkan struktur server FastAPI (`routers/`, `schemas/`, `services/`).
- [ ] Membuat endpoint REST API untuk melayani data batch, ringkasan dashboard, dan pemicu simulasi.
- [ ] Mengaktifkan dokumentasi otomatis OpenAPI/Swagger di `/docs`.

---

### 👤 Person 3 — Data Architect & Simulator
Jembatan utama yang menyatukan data multi-sumber menjadi satu simulator utuh.
- [ ] **Goal 3:** Menyelaraskan format kategori dari berbagai dataset ke dalam tabel kamus mapping.
- [ ] Menggabungkan pola demand, status stok, dan harga PriceCatcher ke dalam `canonical_batch_table.csv`.
- [ ] Menangani normalisasi mata uang (MYR) dan standar format tanggal.
- [ ] **Goal 4:** Membangun generator batch sintetis terkalibrasi berbasis Python.
- [ ] Menghasilkan log aliran event simulasi (`simulation_events.csv`: status received, scored, routed, wasted).

---

### 👤 Person 4 — Business Logic & Cloud DB Lead
Penerjemah konsep ekonomi anti-moral-hazard ke dalam kode dan penata database awan.
- [ ] **Goal 6:** Mempelajari taksonomi 10 destinasi surplus pangan ReFED.
- [ ] Mengimplementasikan fungsi Python `assign_route()` berbasis ambang batas sisa hari dan skor risiko.
- [ ] Membuat rumus dynamic pricing (diskon bertahap) dan batas kuota donasi per donor.
- [ ] **Goal 9:** Menginisialisasi project cloud PostgreSQL di Supabase.
- [ ] Menjalankan skrip DDL SQL untuk 5 tabel inti (`batches`, `events`, `dispatch_log`, `receivers`, `cluster_results`).
- [ ] Mengonfigurasi hak akses Row Level Security (RLS) dan menulis skrip ETL upload CSV ke Supabase.

---

### 👤 Person 5 — Risk, Routing & Analytics Lead
Memegang siklus pasca-risiko pangan: dari pemberian skor risiko, pemilihan rute penerima, hingga pola pemborosan.
- [ ] **Goal 5:** Melatih model regresi/klasifikasi Waste-Risk Scoring menggunakan `food_waste_dataset.csv`.
- [ ] Mengintegrasikan skor risiko (probabilitas 0–100% terbuang) ke setiap batch.
- [ ] **Goal 7:** Menyiapkan data 10–20 penerima fiktif realistis di area Lembah Klang/Malaysia.
- [ ] Mengintegrasikan API OSRM & Nominatim untuk menghitung rute, jarak km, dan durasi pengiriman.
- [ ] Menulis algoritma greedy matching: memilih penerima terbaik berdasarkan jarak terdekat dan kapasitas cukup.
- [ ] **Goal 8:** Menjalankan algoritma klastering (K-Means/DBSCAN) pada data agregat hasil simulasi.
- [ ] Menafsirkan profil klaster toko (mana toko boros vs stabil) dan menulis draf `cluster_report.md` *(dibantu Person 1)*.

---

### 👤 Person 6 — Frontend & Visual Lead
Membangun wajah aplikasi yang dilihat publik dan penguji, serta menjaga keindahan presentasi kelompok.
- [ ] **Goal 11:** Inisialisasi frontend Next.js / Streamlit + Tailwind CSS.
- [ ] Membangun antarmuka Dashboard publik (KPI Cards, grafik distribusi risiko, diagram alur batch, peta Leaflet).
- [ ] **Goal 12:** Membangun halaman Admin `/admin` terproteksi login otentikasi Supabase.
- [ ] Membuat fitur pemicu simulasi on-demand dan tabel manajemen penerima donasi.
- [ ] **Visual Lead:** Mengoordinasikan slide Canva bersama tim.
  - Setiap anggota mengisi materi kasar di slide Canva (teks dan chart polos).
  - Person 6 merapikan desain, palet warna, tipografi, dan layout agar seragam dan berstandar profesional.

---

## 3. Aturan Kerja & Kolaborasi Tim

1. **Prinsip Zero-Waiting (Mulai Bersama di Day 1):**  
   Gunakan panduan di file `INDEPENDENT_TASKS.md`. Setiap orang langsung mulai mengerjakan komponen mandiri masing-masing menggunakan *mock/dummy data* tanpa menunggu modul orang lain selesai.
2. **Setiap Orang Menulis Bahasannya Sendiri:**  
   * **Di Laporan:** Setiap anggota bertanggung jawab menulis metodologi, hasil eksperimen, dan screenshot dari Goal yang mereka kerjakan.
   * **Di Presentasi:** Setiap anggota mempresentasikan 2–3 slide yang merefleksikan kontribusi teknis mereka sendiri.
3. **Penyelarasan Mingguan (Weekly Sync):**  
   Evaluasi berkala setiap minggu cukup dengan memeriksa checklist tugas di dokumen `WORKSTEPS.md` dan `WORKSTEPS_APP.md` yang sudah dicentang.

