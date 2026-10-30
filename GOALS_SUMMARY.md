# Summary of Project Goals: Complexity, Outputs, and Division of Work

> **Dynamic Food Clearing House Simulator**  
> Pemetaan komprehensif seluruh target proyek: kategori teknis, tingkat kerumitan (keterlibatan manual vs bantuan AI), tipe artefak output, dan detail deliverable.

---

### Master Table: Goals, Kategori, Kompleksitas, dan Output

| # | Goal | Kategori | Kompleksitas & Keterlibatan AI | Tipe Output | Detail Deliverable |
|---|---|---|---|---|---|
| **1** | **FEFO & Spoilage Risk Classification** | 🤖 ML | ⚡ **Ringkas dengan AI**<br>Pipeline klasifikasi tabular standar. AI bisa generate kode EDA, feature engineering, training, dan evaluasi. | 🧩 Model ML | Trained classifier (`.pkl`) + fungsi `predict_spoilage_risk(batch)` |
| **2** | **Demand Forecasting** | 🤖 ML | 🧠 **Manual-Heavy**<br>Banyak eksplorasi metodologi (SARIMA vs Prophet vs LightGBM), tuning data time series, penyesuaian seasonality, dan keputusan model terbaik. | 🧩 Model ML | Trained forecaster (`.pkl`) + tabel prediksi `demand_forecast` (store × item × date) |
| **3** | **Canonical Schema & Mapping Tables** | 🤖 ML / Data Eng | 🧠 **Manual-Heavy**<br>Membaca 5+ dataset mentah, harmonisasi unit/kategori, normalisasi harga MYR, dan menentukan kontrak data bersama (tidak bisa diotomasi penuh). | 📄 Persiapan Data | `canonical_batch_table.csv` + skema kanonikal + fungsi `merge_to_canonical()` |
| **4** | **Simulator Engine** | 🤖 ML / Data Eng | ⚡ **Ringkas dengan AI**<br>Setelah skema dari Goal 3 didefinisikan, pembuatan batch generator sintetis terkalibrasi berbasis aturan mudah digenerate dengan AI. | ⚙️ Engine / Script | `simulation_events.csv` (log event batch: received, scored, routed, wasted) |
| **5** | **Waste-Risk Scoring** | 🤖 ML | 🔄 **Mixed**<br>Feature engineering & formulasi risiko butuh domain understanding; training regressor/classifier dan evaluasi bisa dibantu AI. | 🧩 Model ML | Trained model (`.pkl`) + field `waste_risk_score` (0–100%) & `time_to_waste_hours` |
| **6** | **Rule Engine Jalur Surplus** | ⚙️ BE | 🧠 **Manual-Heavy**<br>Mempelajari kerangka kerja ReFED (10 destinasi), menentukan threshold umur/diskon, dan merancang aturan bisnis anti-moral-hazard. | ⚙️ Engine / Script | Modul `assign_route(batch)` → menghasilkan `recommended_route`, `discount_percent`, `expected_value_myr` |
| **7** | **Matching & Dispatch** | ⚙️ BE | 🔄 **Mixed**<br>Formulasi fungsi skor alokasi dan constraint butuh pertimbangan logika; implementasi pemanggilan API OSRM/Nominatim bisa dibantu AI. | ⚙️ Engine / Script | `dispatch_log.csv` (pasangan batch ↔ receiver + jarak/ETA + jadwal pickup) |
| **8** | **Monitoring & Clustering** | 🤖 ML | 🔄 **Mixed**<br>Eksekusi K-Means/DBSCAN mudah dibantu AI; interpretasi makna klaster, profiling toko/produk boros, dan narasi analitik butuh analisis manusia. | 📊 Analisis & Visualisasi | Label klaster per toko/produk/penerima + visualisasi scatter/heatmap + laporan `cluster_report.md` |
| **9** | **Database & Ingestion** | ⚙️ BE | ⚡ **Ringkas dengan AI**<br>DDL PostgreSQL, skema Supabase, konfigurasi RLS, dan script ingestion CSV adalah kode boilerplate yang bisa di-scaffold cepat oleh AI. | 🗄️ Database | 5 tabel Supabase (PostgreSQL) + RLS security + script Python ETL upload CSV |
| **10** | **REST API** | ⚙️ BE | ⚡ **Ringkas dengan AI**<br>Endpoint FastAPI berbasis CRUD dan router sangat terstruktur; OpenAPI/Swagger docs otomatis digenerate. | 🌐 API | FastAPI server siap pakai (`/api/batches`, `/api/dashboard`, `/api/simulate/run`, dsb.) |
| **11** | **Dashboard Visualisasi** | 🖥️ FE | ⚡ **Ringkas dengan AI**<br>Komponen UI analitik (KPI cards, bar/pie charts, peta Leaflet, tabel filterable) memiliki pola baku yang sangat cepat di-generate AI. | 🖥️ Web App (Publik) | Dashboard Next.js / Streamlit publik (read-only) dengan visualisasi metrik real-time |
| **12** | **Admin / Developer Page** | 🖥️ FE | ⚡ **Ringkas dengan AI**<br>Halaman proteksi login auth, form pemicu simulasi, tabel manajemen penerima, dan log viewer mengikuti template admin standard. | 🔐 Web App (Auth) | Developer console terproteksi otentikasi Supabase untuk manajemen sistem & trigger run |

---

### Ringkasan Strategis untuk Pembagian Tugas

#### 1. Berdasarkan Tingkat Kerumitan & Kebutuhan Fokus
| Tingkat Kerumitan | Goals | Karakteristik & Rekomendasi Pengerjaan |
|---|---|---|
| 🧠 **Manual-Heavy** | **2, 3, 6** | **Bottleneck Intelektual:** Memerlukan eksplorasi, pembacaan literatur, dan pengambilan keputusan desain. Alokasikan anggota yang teliti dan berikan waktu lebih awal. |
| 🔄 **Mixed** | **5, 7, 8** | **Kolaboratif Human + AI:** Manusia menentukan parameter dan batasan aturan; implementasi kode teknis dan pemodelan dibantu AI. |
| ⚡ **Ringkas dengan AI** | **1, 4, 9, 10, 11, 12** | **High-Velocity Output:** Menggunakan pola/boilerplate baku yang sangat cepat diimplementasikan dengan bantuan agentic AI. |

#### 2. Berdasarkan Tipe Deliverable
| Tipe Output | Goals | Bentuk Hasil Nyata |
|---|---|---|
| 🧩 **Model ML** | 1, 2, 5 | Binary model (`.pkl`), pipeline inference, dan fungsi skoring |
| 📄 **Persiapan Data** | 3 | Skema kanonikal, mapping dictionary, dan dataset terstandar |
| ⚙️ **Engine / Script** | 4, 6, 7 | Algoritma simulasi, business rules engine, dan modul matching dispatch |
| 📊 **Analisis & Visualisasi** | 8 | Profil klastering, visualisasi distribusi, dan laporan wawasan data |
| 🗄️ **Database** | 9 | Skema tabel cloud Supabase, migration, dan pipeline sinkronisasi data |
| 🌐 **API** | 10 | Layanan FastAPI dengan dokumentasi Swagger interaktif |
| 🖥️ / 🔐 **Web App** | 11, 12 | Antarmuka pengguna (Dashboard visualisasi metrik & CMS Admin) |
