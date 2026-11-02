# Summary of Project Goals: Phase, Complexity & Outputs

> **Dynamic Food Clearing House**  
> Pemetaan seluruh goals proyek: fase pembangunan, tingkat kerumitan, keterlibatan AI, tipe output, dan detail deliverable.

---

> [!IMPORTANT]
> **🏗️ BASE** = Fitur minimum sesuai `Alur_Penggunaan_Sistem.pdf` — dikerjakan PERTAMA.  
> **🚀 UPGRADE** = Penambahan kecerdasan di balik layar — dikerjakan setelah Base stabil. **UI tidak berubah.**

---

### Master Table: Phase, Goals, Kategori, Kompleksitas, dan Output

| Phase | # | Goal | Kategori | Kompleksitas & Keterlibatan AI | Tipe Output | Detail Deliverable |
|:---:|---|---|---|---|---|---|
| 🏗️ BASE | **1** | **FEFO & Spoilage Risk Classification** | 🤖 ML | ⚡ **Ringkas dengan AI** — Pipeline klasifikasi tabular standar. | 🧩 Model ML | Trained classifier (`.pkl`) + fungsi `predict_spoilage_risk(lot)` → JSON label LOW/MODERATE/HIGH |
| 🏗️ BASE | **2** | **Demand Forecasting** | 🤖 ML | 🧠 **Manual-Heavy** — Banyak pilihan metodologi; tuning lag features butuh iterasi. | 🧩 Model ML | Trained forecaster (`.pkl`) + prediksi demand 3 hari ke depan per produk per toko |
| 🚀 UPGRADE | **3** | **Canonical Schema & Mapping Tables** | 🤖 ML / Data Eng | 🧠 **Manual-Heavy** — Baca & harmonisasi 5+ dataset berbeda, normalisasi MYR. Tidak bisa diotomasi penuh. | 📄 Persiapan Data | `canonical_batch_table.csv` + kamus mapping + fungsi `merge_to_canonical()` |
| 🚀 UPGRADE | **4 Full** | **Multi-Source Simulator Engine** | 🤖 ML / Data Eng | ⚡ **Ringkas dengan AI** — Setelah Goal 3 selesai, AI bisa generate generator batch terkalibrasi. | ⚙️ Engine / Script | `simulation_events.csv` lengkap (event multi-toko: received, scored, routed, wasted) |
| 🏗️ BASE | **4 Base** | **Single-Source Batch Generator** | 🤖 ML / Data Eng | ⚡ **Ringkas dengan AI** — Generator lot sederhana dari 1 dataset inventory. | ⚙️ Engine / Script | `lots_base.csv` — daftar lot aktif per toko untuk demo base |
| 🚀 UPGRADE | **5** | **Waste-Risk Scoring** | 🤖 ML | 🔄 **Mixed** — Feature engineering butuh domain judgment; training model bisa AI-assisted. | 🧩 Model ML | Trained model (`.pkl`) + field `waste_risk_score` (0–100%) & `time_to_waste_hours` di tiap lot |
| 🏗️ BASE | **6 Base** | **Rule Engine Sederhana (3 Jalur)** | ⚙️ BE | ⚡ **Ringkas dengan AI** — Logika `if/elif` 3 cabang: Normal Sale / Markdown flat / Donate. | ⚙️ Engine / Script | Fungsi `assign_route(days, qty, demand)` → label aksi + diskon flat |
| 🚀 UPGRADE | **6 Full** | **Rule Engine ReFED + Anti-Moral-Hazard** | ⚙️ BE | 🧠 **Manual-Heavy** — Baca ReFED (10 destinasi), rancang kuota donasi & dynamic pricing MYR. | ⚙️ Engine / Script | `assign_route()` diperluas: Normal → Dynamic Pricing → B2B → Donasi (berquota) → Recovery |
| 🚀 UPGRADE | **7** | **Matching & Dispatch (OSRM Routing)** | ⚙️ BE | 🔄 **Mixed** — Desain constraint perlu judgment; **API OSRM cukup 1 baris `requests.get()`** — jauh lebih simpel dari kedengarannya! | ⚙️ Engine / Script | `dispatch_log.csv` — pasangan lot ↔ receiver terpilih + jarak km + ETA + jadwal pickup |
| 🚀 UPGRADE | **8** | **Monitoring & Clustering Toko** | 🤖 ML | 🔄 **Mixed** — **K-Means hanya 5 baris Scikit-Learn**; interpretasi klaster & narasi analitik butuh judgment manusia. | 📊 Analisis & Visualisasi | Label klaster per toko/produk + scatter plot + `cluster_report.md` |
| 🏗️ BASE | **9** | **Database & Ingestion (Supabase)** | ⚙️ BE | ⚡ **Ringkas dengan AI** — DDL PostgreSQL dan setup RLS adalah boilerplate baku. | 🗄️ Database | 5 tabel Supabase + RLS + kolom cadangan upgrade (NULL dulu): `waste_risk_score`, `receiver_id`, `market_price_myr` |
| 🏗️ BASE | **10** | **REST API (FastAPI)** | ⚙️ BE | ⚡ **Ringkas dengan AI** — Endpoint CRUD dan Swagger docs otomatis digenerate. | 🌐 API | FastAPI server: `/api/lots`, `/api/forecast`, `/api/recommend`, `/api/dashboard/summary` |
| 🏗️ BASE | **11** | **Dashboard Toko (6-Langkah PDF)** | 🖥️ FE | ⚡ **Ringkas dengan AI** — Komponen UI standar (badge, grafik, tombol aksi). | 🖥️ Web App (Publik) | Web app 6-langkah: FEFO stok → cek risiko → lihat forecast → aksi → dashboard KPI |
| 🏗️ BASE | **12** | **Admin / Developer Page** | 🖥️ FE | ⚡ **Ringkas dengan AI** — Auth Supabase + CRUD tabel = template admin standar. | 🔐 Web App (Auth) | Panel admin terproteksi: manajemen lot, penerima donasi, trigger re-scoring |

---

### 3 Dataset Upgrade (dari Person 0) → Dampak per Goal

| Dataset Upgrade | Masuk Ke | Cara Masuknya | Dampak | Re-train Model? |
|---|---|---|---|---|
| 📅 **Kalender Libur Malaysia** (`holidays_my.csv`) | **Goal 2** (Demand Forecasting) | Person 2 tambahkan kolom `is_holiday` ke training data | Model kini peka lonjakan Hari Raya / Tahun Baru Imlek / Deepavali | ✅ Re-train ringan (~2 menit) |
| 💰 **Lookup DOSM PriceCatcher** (`item.parquet`) | **Goal 6 Full** (Rule Engine) | Person 4 pakai sebagai referensi harga pasar MYR di rumus dynamic pricing | Diskon tidak lagi flat 20%, tapi dihitung berbasis harga riil Malaysia | ❌ Tidak ada re-train — hanya update rumus |
| 🗑️ **`food_waste_dataset.csv` 8K** (imputasi Person 0) | **Goal 5** (Waste-Risk Scoring) | Person 5 gunakan sebagai training data model ML baru | Muncul model baru: prediksi probabilitas lot terbuang dalam Y jam | ✅ Training model baru (Goal 5 sendiri) — **Model Goal 1 & 2 tidak terpengaruh!** |

---

### Ringkasan per Phase

#### 🏗️ BASE (Target PDF Toto)
Goals: **1, 2, 4 Base, 6 Base, 9, 10, 11, 12**  
Stack: Python (Sklearn, LightGBM, FastAPI) + Supabase + Next.js/Streamlit  
Output: Aplikasi web 6-langkah berjalan end-to-end (data lot → prediksi → rekomendasi aksi → dashboard)

#### 🚀 UPGRADE (Filling the gaps)
Goals: **3, 4 Full, 5, 6 Full, 7, 8** + 3 Dataset Upgrade dari Person 0  
Klarifikasi Kerumitan:
- Goal 7 (OSRM): **Bukan bikin routing engine sendiri** — cukup panggil 1 API publik gratis
- Goal 8 (Clustering): **Bukan riset ML canggih** — 5 baris `sklearn.cluster.KMeans`, sisanya analisis & visualisasi
- Goal 5 (Waste-Risk): Sama seperti Goal 1 yang sudah dikerjakan Person 1, hanya dengan dataset berbeda
- Goal 6 Full (ReFED): Perluas `if/elif` yang sudah ada, bukan tulis ulang dari nol
