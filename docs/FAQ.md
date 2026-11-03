# Frequently Asked Questions (FAQ) — Dynamic Food Clearing House Simulator

> **Dokumen Panduan Cepat & Resolusi Keraguan Tim (AIT-201)**  
> Jika Anda bingung harus mulai dari mana, ragu batasan tugas Anda, atau butuh jawaban cepat saat coding, baca dokumen ini sebelum bertanya ke grup.

---

## 📌 Navigasi Cepat

1. [Pertanyaan Umum Proyek & Arsitektur](#1-pertanyaan-umum-proyek--arsitektur)
2. [FAQ Person 0 — Dataset Quality & Localization](#2-faq-person-0--dataset-quality--localization)
3. [FAQ Person 1 — Tech Lead & Spoilage ML](#3-faq-person-1--tech-lead--spoilage-ml)
4. [FAQ Person 2 — Forecaster & API Engineer](#4-faq-person-2--forecaster--api-engineer)
5. [FAQ Person 3 — Data Architect & Pipeline](#5-faq-person-3--data-architect--pipeline)
6. [FAQ Person 4 — Business Logic & Cloud Database](#6-faq-person-4--business-logic--cloud-database)
7. [FAQ Person 5 — Risk Scoring & Smart Dispatch](#7-faq-person-5--risk-scoring--smart-dispatch)
8. [FAQ Person 6 — Frontend, GIS & Visual](#8-faq-person-6--frontend-gis--visual)
9. [Aturan Git & Kolaborasi Kode](#9-aturan-git--kolaborasi-kode)

---

## 1. Pertanyaan Umum Proyek & Arsitektur

### Q: Apa inti proyek kita dalam 1 kalimat?
**A:** Membangun simulator cerdas berbasis web yang mengalihkan bahan pangan berlebih (*surplus food*) dari supermarket di Malaysia agar tidak terbuang ke TPA, melalui diskon dinamis bertahap dan pengiriman otomatis ke food bank via optimasi rute OSRM.

### Q: Apakah kita perlu menyambungkan sistem ke mesin kasir (POS) nyata?
**A:** **TIDAK.** Proyek kita adalah **Simulator Terkalibrasi**. Data stok diumpankan dari file inventaris (`lots_base.csv`) dan generator event, bukan integrasi fisik ke hardware kasir supermarket asli.

### Q: Mengapa alur proyek dibagi menjadi BASE, UPGRADE, dan OPSIONAL?
**A:** 
* 🏗️ **BASE (Fase 1 - Prioritas Utama):** Sistem 6-langkah sesuai PDF `Alur_Penggunaan_Sistem.pdf` level 1 toko ritel yang sudah lengkap dengan ML, database, diskon DOSM, API, dan peta Leaflet. **Ini wajib selesai dan stabil terlebih dahulu untuk demo utama.**
* 🚀 **UPGRADE (Fase 2 - Ekspansi Skala):** Pengembangan sistem dari 1 toko tunggal menjadi simulator skala jaringan multi-cabang terintegrasi (*clearing house* 5 dataset).
* 💡 **OPSIONAL (Fase 3 - Nilai Tambah):** Riset tambahan seperti klastering K-Means (Goal 8) untuk memperkaya analisis di makalah/laporan akhir.

### Q: Mengapa proyek ini menggunakan data Malaysia?
**A:** Agar solusi memiliki konteks lokal yang riil dan berbobot akademis:
1. Harga komoditas pangan mengacu ke data resmi **DOSM PriceCatcher** (dalam MYR).
2. Peramalan penjualan mempertimbangkan **Kalender Libur Nasional Malaysia** (Hari Raya, Imlek, Deepavali).
3. Titik penerima donasi adalah **Food Bank, Dapur Umum, dan Panti Asuhan riil di kawasan Lembah Klang**.

---

## 2. FAQ Person 0 — Dataset Quality & Localization

### Q: File DOSM PriceCatcher ukurannya sangat besar (>1,2 juta baris), apakah harus diolah semua?
**A:** **Tidak perlu.** Cukup ambil data bulan terbaru (misalnya `pricecatcher_2026-10.csv`), lalu filter pada komoditas pangan segar/kering yang relevan dengan supermarket (sayur, buah, daging, telur, susu).

### Q: Mengapa kalender libur dari dataset Favorita (Ekuador) harus diganti?
**A:** Karena dataset M5/Favorita menggunakan hari libur nasional Ekuador (seperti Hari Kemerdekaan Guayaquil) yang tidak relevan dengan lonjakan belanja di supermarket Malaysia. Anda cukup membuat `data/processed/holidays_my.csv` berisi ~20 hari libur nasional Malaysia.

### Q: Bagaimana cara mengisi 5 kolom null di `food_waste_dataset.csv` (8.000 baris)?
**A:** Gunakan teknik *group-median imputation* berbasis kombinasi `Food_Category` dan `Business_Type` menggunakan Pandas/Python (membutuhkan waktu ~30 menit dengan bantuan script AI).

---

## 3. FAQ Person 1 — Tech Lead & Spoilage ML

### Q: Mengapa model Spoilage Classifier dilatih di Google Colab?
**A:** Di Google Colab, semua library data science (`pandas`, `scikit-learn`, `xgboost`, `lightgbm`) sudah terpasang bawaan (0 MB download lokal). Model yang dihasilkan disimpan sebagai file biner kecil `models/spoilage_classifier.pkl` (~100 KB–2 MB) dan di-commit ke Git.

### Q: Apa perbedaan Spoilage Classifier (Goal 1) dengan Waste-Risk Model (Goal 5)?
**A:**
* **Spoilage Classifier (Person 1 - Step 7):** Menilai kerusakan fisik/biologis lot berdasarkan tanggal kedaluwarsa dan perputaran stok gudang (`HIGH`, `MODERATE`, `LOW`).
* **Waste-Risk Model (Person 5 - Step 11):** Menilai probabilitas terbuangnya lot (0–100%) akibat gabungan faktor biologis, gap permintaan pasar (*demand gap*), dan nilai komoditas.

---

## 4. FAQ Person 2 — Forecaster & API Engineer

### Q: Bagaimana cara saya membangun API jika modul Person 1, 3, 4, 5 belum selesai?
**A:** **Gunakan Mock Data JSON (Dummy Data)!** Buat endpoint FastAPI (`/api/lots`, `/api/forecast`, `/api/recommend`, dll.) yang mengembalikan data tiruan sesuai skema Pydantic. Dengan begitu, Person 6 (Frontend) bisa langsung mengintegrasikan UI tanpa harus menunggu modul analitik selesai.

### Q: Di mana saya bisa mengetes endpoint API yang saya buat?
**A:** Jalankan server dengan `uvicorn backend.main:app --reload`, lalu buka dokumentasi interaktif Swagger di peramban: `http://localhost:8000/docs`.

---

## 5. FAQ Person 3 — Data Architect & Pipeline

### Q: Apakah di Fase 1 (BASE) saya harus menggabungkan 5 dataset sekaligus?
**A:** **TIDAK SAMA SEKALI!** Di Fase 1 (BASE), tugas Anda **hanya** membuat script ETL yang mengolah 1 dataset inventaris mentah (`Grocery_Inventory new v1.csv`) menjadi format bersih **`lots_base.csv`**. Pekerjaan menggabungkan 5 dataset (Canonical Schema) adalah tugas Fase 2 (UPGRADE).

### Q: Apa format kolom standar untuk `lots_base.csv`?
**A:**
* `lot_id` (string/integer unik)
* `product_name` (nama produk)
* `category` (kategori: Produce, Dairy, Meat, Bakery, dll.)
* `quantity` (jumlah unit/kg)
* `expiry_date` (format ISO: `YYYY-MM-DD`)
* `unit_price_myr` (harga satuan dalam Ringgit Malaysia)

### Q: Apa event types yang benar untuk generator simulator (`simulation_events.csv`)?
**A:** Scope simulator kita berada di tingkat ritel/supermarket (Step 7–14), jadi tipe event resminya adalah:
* `received` (stok baru masuk gudang toko)
* `active_fefo` (lot dipajang di rak toko urutan FEFO)
* `markdown` (harga diturunkan menjelang expired)
* `dispatched` (lot dikirim ke food bank)
* `wasted` (lot terbuang ke TPA karena rusak)
*(❌ Jangan gunakan event farm/panen seperti Harvested, Shipped, Stored)*.

---

## 6. FAQ Person 4 — Business Logic & Cloud Database

### Q: Apa itu aturan Anti-Moral-Hazard Pembeli dan bagaimana penerapannya?
**A:** Jika konsumen tahu supermarket selalu membagikan donasi gratis di rak toko setiap malam, mereka akan menahan belanja dan menunggu makanan gratis (kanibalisasi penjualan).  
Penerapannya di kode `assign_route()`:
1. Donasi disalurkan secara tertutup (*channel segregation*) langsung ke mitra food bank resmi, bukan dibagikan ke publik di etalase toko.
2. Kuota donasi dibatasi maksimal 30% dari total surplus untuk mendorong toko memprioritaskan diskon komersial (markdown) terlebih dahulu.

### Q: Bagaimana cara setup Supabase agar aman untuk Upgrade di masa depan?
**A:** Saat membuat tabel PostgreSQL di Supabase pada Day 1, kolom-kolom milik Upgrade (`waste_risk_score`, `receiver_id`, `market_price_myr`) **wajib dibuat sejak awal dengan nilai default `NULL`**. Ini memastikan struktur database tidak perlu di-migrasi ulang saat fitur Upgrade diaktifkan.

---

## 7. FAQ Person 5 — Risk Scoring & Smart Dispatch

### Q: Apakah saya perlu menginstal atau hosting server OSRM sendiri di laptop?
**A:** **TIDAK PERLU.** OSRM menyediakan server demo publik gratis yang bisa dipanggil cukup dengan **1 baris kode HTTP GET**:
```python
import requests
url = f"http://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson"
response = requests.get(url).json()
distance_km = response['routes'][0]['distance'] / 1000
eta_minutes = response['routes'][0]['duration'] / 60
polyline_geojson = response['routes'][0]['geometry']
```

### Q: Dari mana saya mendapatkan daftar food bank penerima donasi?
**A:** Anda membuat file `data/processed/receivers_list.csv` berisi 10–20 entri realistis di kawasan Lembah Klang (Kuala Lumpur & Selangor), lengkap dengan nama lembaga, latitude, longitude, kapasitas penampungan (kg), dan jenis makanan yang diterima.

---

## 8. FAQ Person 6 — Frontend, GIS & Visual

### Q: Dari mana acuan desain antarmuka web dashboard?
**A:** Buka dokumen `docs/Alur_Penggunaan_Sistem.pdf`. Halaman dashboard utama merefleksikan 6 langkah yang ada di PDF tersebut:
1. Tabel Stok Aktif (FEFO Order)
2. Label & Skor Risiko Kerusakan
3. Grafik Peramalan Permintaan (Demand Forecast)
4. Kartu Rekomendasi Aksi (Normal / Markdown / Donasi)
5. **Peta Interaktif Pengiriman Donasi (Leaflet JS + Rute OSRM)**
6. Ringkasan KPI Dampak (Makanan terselamatkan, clearance rate)

### Q: Apakah Peta Leaflet JS masuk ke Fase BASE atau UPGRADE?
**A:** **Masuk ke Fase BASE (Fase 1)!** Visualisasi rute donasi di peta adalah bagian inti dari Langkah 5 PDF. Person 6 membuat peta Leaflet yang merender marker toko, marker food bank, dan garis polyline jalan raya yang disuplai oleh Person 5 dan API Person 2.

### Q: Di mana folder project frontend?
**A:** Folder project sudah diinisialisasi menggunakan Next.js + Tailwind CSS di folder `frontend/`.

---

## 9. Aturan Git & Kolaborasi Kode

### Q: Apakah file dataset besar (`.parquet`, `.csv` ukuran puluhan MB) boleh di-commit ke Git?
**A:** **TIDAK BOLEH.** File `.gitignore` sudah dikonfigurasi untuk memblokir file dataset mentah dan model biner besar. Simpan dataset mentah di `data/raw/` (hanya ada di lokal komputer Anda).

### Q: Apa yang harus saya lakukan sebelum mulai menulis kode baru?
**A:** Selalu biasakan menarik pembaruan terbaru dari tim:
```bash
git pull origin main
```

### Q: Jika terjadi konflik atau kebingungan tugas antar-anggota, apa rujukannya?
**A:** Buka dan cocokkan dengan:
1. Matriks peran: [`docs/PEMBAGIAN_TUGAS.md`](file:///c:/Coding/University/Univ%20Codes/final-ait201/docs/PEMBAGIAN_TUGAS.md)
2. Task harian mandiri: [`docs/INDEPENDENT_TASKS.md`](file:///c:/Coding/University/Univ%20Codes/final-ait201/docs/INDEPENDENT_TASKS.md)
3. Alur teknis machine learning: [`docs/WORKSTEPS.md`](file:///c:/Coding/University/Univ%20Codes/final-ait201/docs/WORKSTEPS.md)
4. Alur teknis aplikasi & API: [`docs/WORKSTEPS_APP.md`](file:///c:/Coding/University/Univ%20Codes/final-ait201/docs/WORKSTEPS_APP.md)

