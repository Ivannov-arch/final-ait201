# Summary of Project Goals: Phase, Complexity & Outputs

> **Dynamic Food Clearing House**  
> Pemetaan seluruh goals proyek: fase pembangunan (rebalanced), tingkat kerumitan, keterlibatan AI, tipe output, dan detail deliverable.

---

## 3 Kategori Klasifikasi Fitur (Rebalanced)

| Label | Kategori | Fase Eksekusi | Deskripsi |
|:---:|---|:---:|---|
| 🏗️ **BASE** | **Core System (Toko Solid + GIS Leaflet)** | Fase 1 (Prioritas Utama) | Sistem toko 6-langkah sesuai PDF yang berbobot: didukung data harga pasar DOSM Malaysia, kalender libur lokal, model ML ganda (Spoilage + Waste-Risk), dan **peta rute interaktif Leaflet JS berbasis OSRM**. |
| 🚀 **UPGRADE** | **Multi-Store Clearing House Expansion** | Fase 2 (Ekspansi Skala) | Ekspansi skala dari toko tunggal menjadi ekosistem clearing house multi-cabang (simulator event dinamis, taksonomi ReFED 10-destinasi penuh, dan rute multi-drop). |
| 💡 **OPSIONAL** | **Stretch Goals (Analitik Makro)** | Fase 3 (Fitur Opsional) | Analisis segmentasi toko K-Means (5 baris Sklearn), deteksi anomali toko boros, dan live streaming log terminal untuk nilai tambah akademis di laporan akhir. |

---

### Master Table: Phase, Goals, Kategori, Kompleksitas, dan Output

| Phase | # | Goal | Kategori | Kompleksitas & Keterlibatan AI | Tipe Output | Detail Deliverable |
|:---:|---|---|---|---|---|---|
| 🏗️ BASE | **1** | **FEFO & Spoilage Risk Classification** | 🤖 ML | ⚡ **Ringkas dengan AI** — Pipeline klasifikasi tabular standar. | 🧩 Model ML | Trained classifier (`spoilage_classifier.pkl`) + fungsi `predict_spoilage_risk(lot)` → JSON label LOW/MODERATE/HIGH |
| 🏗️ BASE | **2** | **Demand Forecasting (Holiday-Aware)** | 🤖 ML | 🧠 **Manual-Heavy** — Tuning lag features time-series M5 + integrasi kalender libur MY. | 🧩 Model ML | Trained forecaster (`demand_forecast.pkl`) + prediksi demand 3 hari ke depan per produk |
| 🏗️ BASE | **4 Base** | **Single-Source Batch Pipeline** | 🤖 Data Eng | ⚡ **Ringkas dengan AI** — Script ETL pengolah inventaris mentah toko. | ⚙️ Engine / Script | `lots_base.csv` — daftar lot aktif per toko untuk demo base |
| 🏗️ BASE | **5** | **Waste-Risk Scoring Model** | 🤖 ML | 🔄 **Mixed** — Menggunakan data `food_waste_dataset.csv` 8K hasil imputasi Person 0. | 🧩 Model ML | Trained model (`waste_risk_model.pkl`) + field probabilitas `waste_risk_score` (0–100%) |
| 🏗️ BASE | **6 Base+** | **Rule Engine Dynamic Markdown + Anti-Moral-Hazard** | ⚙️ BE | ⚡ **Ringkas dengan AI** — Rumus diskon bertahap berbasis harga DOSM MYR + segregasi jalur donasi tertutup (kuota 30%). | ⚙️ Engine / Script | Fungsi `assign_route()` cerdas: Normal → Dynamic Markdown DOSM → Donasi Berkuota |
| 🏗️ BASE | **7** | **Smart Matching & OSRM Dispatch Engine** | ⚙️ BE | 🔄 **Mixed** — **1 baris `requests.get()` OSRM API** untuk mencari food bank terdekat, kapasitas, jarak km, ETA, & **polyline jalan riil**. | ⚙️ Engine / Script | `dispatch_log.csv` — pasangan lot ↔ food bank terpilih + jarak km + ETA menit + GeoJSON polyline |
| 🏗️ BASE | **9** | **Database & Ingestion (Supabase)** | ⚙️ BE | ⚡ **Ringkas dengan AI** — DDL PostgreSQL 5 tabel dan setup RLS boilerplate baku. | 🗄️ Database | 5 tabel Supabase + RLS + view ringkasan dashboard `v_dashboard_summary` |
| 🏗️ BASE | **10** | **REST API Core (FastAPI)** | ⚙️ BE | ⚡ **Ringkas dengan AI** — Endpoint CRUD, forecast, recommend, route OSRM, dan Swagger docs. | 🌐 API | FastAPI server: `/api/lots`, `/api/forecast`, `/api/recommend`, `/api/dispatch-route`, `/api/dashboard/summary` |
| 🏗️ BASE | **11** | **Dashboard Toko 6-Langkah + Peta Leaflet JS** | 🖥️ FE | 🔄 **Mixed** — Komponen UI toko PDF + **peta interaktif Leaflet JS (marker toko, food bank, rute OSRM)**. | 🖥️ Web App (Publik) | Web app interaktif 6-langkah: FEFO stok → cek risiko ML → forecast → aksi → **peta rute pengiriman donasi** → KPI |
| 🏗️ BASE | **12** | **Admin / Developer Page Sederhana** | 🖥️ FE | ⚡ **Ringkas dengan AI** — Auth Supabase + CRUD tabel standar. | 🔐 Web App (Auth) | Panel admin dasar: list lot, list penerima, trigger re-scoring |
| 🚀 UPGRADE | **3** | **Canonical Schema Multi-Dataset** | 🤖 Data Eng | 🧠 **Manual-Heavy** — Harmonisasi 5+ dataset, normalisasi format dan mapping kategori lintas negara. | 📄 Persiapan Data | `canonical_batch_table.csv` + kamus mapping + fungsi `merge_to_canonical()` |
| 🚀 UPGRADE | **4 Full** | **Multi-Source Simulator Engine** | 🤖 Data Eng | ⚡ **Ringkas dengan AI** — Generator batch terkalibrasi multi-toko berbasis event loop. | ⚙️ Engine / Script | `simulation_events.csv` dinamis (event: received, sold, markdown, routed, wasted) |
| 🚀 UPGRADE | **6 Full** | **ReFED 10-Destinasi Lengkap** | ⚙️ BE | 🧠 **Manual-Heavy** — Jalur surplus non-manusia: pakan ternak (*animal feed*), kompos, dan lelang B2B wholesale. | ⚙️ Engine / Script | `assign_route()` ReFED penuh 10 cabang destinasi |
| 🚀 UPGRADE | **7 Multi** | **Multi-Drop Dispatch Optimization** | ⚙️ BE | 🔄 **Mixed** — Optimasi rute 1 armada mengambil surplus dari 2 toko terdekat. | ⚙️ Engine / Script | Rute OSRM multi-titik |
| 💡 OPSIONAL | **8** | **Monitoring & Clustering Toko (K-Means)** | 🤖 ML | 🔄 **Mixed** — **5 baris `sklearn.cluster.KMeans`**. Analisis pola waste & velocity toko multi-cabang. | 📊 Laporan & Riset | Label klaster toko/produk + scatter plot + `cluster_report.md` |
| 💡 OPSIONAL | **A5 Advanced** | **Live Simulation SSE & Advanced CMS** | ⚙️ BE / FE | 🧠 **Manual-Heavy** — WebSocket / SSE streaming log terminal simulasi ke browser. | 🖥️ Developer Console | Panel dev interaktif canggih (di luar kebutuhan presentasi dasar). |

---

### Integrasi Data Riil Malaysia di Fase BASE

Keempat data ini **langsung masuk ke Fase BASE** untuk menjamin bobot dan kelengkapan sistem sejak awal:

| Data Komponen | Penanggung Jawab | Masuk Ke | Manfaat Langsung pada Alur BASE |
|---|---|---|---|
| 📅 **Kalender Libur Malaysia** (`holidays_my.csv`) | Person 0 | **Goal 2** (Demand Forecasting) | Model forecasting peka lonjakan belanja menjelang Hari Raya / Imlek / Deepavali di Malaysia |
| 💰 **Lookup DOSM PriceCatcher** (`item.parquet`) | Person 0 | **Goal 6 Base+** (Rule Engine) | Nilai diskon markdown dihitung berbasis harga pasar riil komoditas Malaysia, bukan tebak-tebakan |
| 🗑️ **Food Waste 8K Imputasi** | Person 0 | **Goal 5** (Waste-Risk Model) | Muncul probabilitas numerik batch terbuang (0–100%) mendampingi klasifikasi FEFO |
| 🗺️ **Peta Rute OSRM & Leaflet JS** | Person 5 & Person 6 | **Goal 7 & 11** (GIS Visualization) | Langkah 5 PDF tidak lagi abstrak: peta Leaflet langsung menampilkan rute jalan riil dari toko ke food bank |
