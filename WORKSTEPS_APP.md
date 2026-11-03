# WORKSTEPS APP — Database, Backend & Frontend
> **Scope:** Infrastruktur aplikasi untuk Dynamic Food Clearing House Simulator
> File ini terpisah dari `WORKSTEPS.md` (ML/data pipeline).
> Dikerjakan **setelah** Step 7–14 di WORKSTEPS.md sudah menghasilkan output stabil.

---

## Phase Legend

| Label | Nama | Target | Deskripsi |
|---|---|---|---|
| 🏗️ **BASE** | PDF-Level | Fase 1 (Prioritas Utama) | Fitur sesuai `Alur_Penggunaan_Sistem.pdf` — sistem toko tunggal, rule engine 3-jalur, tampilan KPI |
| 🚀 **UPGRADE** | Core Enhancement | Fase 2 (Ekspansi Skala) | Penyempurnaan alur PDF dengan 3 dataset riil, smart dispatch OSRM, & anti-moral-hazard pembeli |
| 💡 **OPSIONAL** | Stretch Goals | Fase 3 (Fitur Opsional) | Fitur di luar alur operasional utama PDF (tab klaster K-Means, live simulation SSE streaming) |

> **Komitmen arsitektur:** Semua kode BASE **tidak perlu ditulis ulang** saat Upgrade. Upgrade = tambah saja,
> tidak ganti. Kolom Upgrade di Supabase wajib ada sejak Day 1 (isi NULL), dan format JSON FastAPI tidak
> boleh berubah antara BASE dan UPGRADE.

---

## Dependency Map

```
WORKSTEPS.md (ML Pipeline)
  └── Output: CSVs + trained models
        └── WORKSTEPS_APP.md (App Layer)
              ├── Step A1: Database Schema (Supabase)         🏗️ BASE
              ├── Step A2: Data Ingestion (CSV → Supabase)    🏗️ BASE (lots_base) / 🚀 UPGRADE (full sim)
              ├── Step A3: Backend API (FastAPI)              🏗️ BASE endpoints / 🚀 UPGRADE extra endpoints
              ├── Step A4: Frontend Dashboard                 🏗️ BASE (6-tab PDF) / 🚀 UPGRADE (peta + klaster)
              └── Step A5: Developer/CMS Page                 🏗️ BASE
```

---

## Step A1 — Database Schema (Supabase) 🏗️ BASE

**Goal:** Desain dan setup schema PostgreSQL di Supabase yang merepresentasikan seluruh output simulator — batch, events, dispatch, cluster — sehingga bisa diakses real-time dari frontend.

**Kenapa Supabase:**
- PostgreSQL cloud + REST API + Realtime subscription otomatis
- Built-in auth untuk Developer/CMS page
- Row Level Security (RLS) untuk isolasi data per user/role

> **Aturan Wajib:** Kolom milik Upgrade (`waste_risk_score`, `receiver_id`, `market_price_myr`) HARUS
> dibuat di tabel sejak Day 1 dengan nilai `NULL`. Ini mencegah schema migration saat Upgrade aktif.

### 🏗️ BASE Tasks
- [ ] Buat project baru di [supabase.com](https://supabase.com)
- [ ] Simpan `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di `.env`
- [ ] Buat tabel `batches` — kolom:
  - BASE: `batch_id`, `product_id`, `category`, `quantity`, `expiry_date`, `price_myr`, `store_id`, `risk_label`, `recommended_route`, `created_at`
  - NULL placeholder (Upgrade): `waste_risk_score NUMERIC`, `receiver_id UUID`, `market_price_myr NUMERIC`
- [ ] Buat tabel `simulation_events` — kolom: `event_id`, `batch_id`, `event_type` (received/scored/dispatched/wasted), `timestamp`, `metadata` (JSONB)
- [ ] Buat tabel `dispatch_log` — kolom: `dispatch_id`, `batch_id`, `receiver_id`, `distance_km`, `eta_hours`, `pickup_time`, `status`
- [ ] Buat tabel `receivers` — kolom: `receiver_id`, `name`, `type` (food_bank/pantry/cafe), `lat`, `lng`, `capacity`, `acceptance_rate`, `accepted_categories` (array)
- [ ] Buat tabel `cluster_results` — kolom: `entity_type` (store/product/receiver), `entity_id`, `cluster_label`, `waste_rate`, `velocity`, `run_date`
- [ ] Setup Row Level Security (RLS): read-only untuk `anon`, full access untuk `authenticated` (admin)
- [ ] Buat Supabase view: `v_dashboard_summary` — agregat KPI utama (total batch, total waste saved, avg risk score)
- [ ] Test koneksi dari Python: `supabase-py` client berhasil query semua tabel

---

## Step A2 — Data Ingestion (CSV → Supabase)

**Goal:** Setelah simulasi di WORKSTEPS.md selesai, upload semua output CSV ke Supabase secara otomatis agar frontend bisa langsung baca data terbaru.

**ML/Teknik:** Tidak ada — ETL script Python

### 🏗️ BASE Tasks
*(Hanya butuh output minimal dari Step 10–11: `canonical_batch_table.csv`)*
- [ ] Install dependensi: `supabase-py`, `pandas`, `python-dotenv`
- [ ] Buat script `ingest/upload_batches.py` — baca `canonical_batch_table.csv` → upsert ke tabel `batches`
- [ ] Tambahkan idempotency: gunakan `upsert` dengan conflict pada primary key agar aman di-run ulang
- [ ] Test: jalankan script, verifikasi data muncul di Supabase Table Editor

### 🚀 UPGRADE Tasks
*(Butuh output penuh Step 12–14: simulation_events, dispatch_log, cluster_results)*
- [ ] Buat script `ingest/upload_events.py` — baca `simulation_events.csv` → upsert ke tabel `simulation_events`
- [ ] Buat script `ingest/upload_dispatch.py` — baca `dispatch_log.csv` → upsert ke tabel `dispatch_log`
- [ ] Buat script `ingest/upload_clusters.py` — baca output clustering Step 14 → upsert ke tabel `cluster_results`
- [ ] Buat script master `ingest/run_all.py` — jalankan semua upload sekaligus dengan error handling

---

## Step A3 — Backend API (FastAPI)

**Goal:** Membangun REST API yang menjadi jembatan antara Supabase dan frontend. API ini juga menjadi titik untuk menjalankan ulang simulasi dan memicu re-scoring secara on-demand.

**Stack:** Python + FastAPI + Uvicorn + supabase-py

> **Kontrak API Wajib:** Format JSON response endpoint BASE **TIDAK BOLEH berubah** saat Upgrade.
> Upgrade hanya menambah field baru (optional) atau endpoint baru. Person 6 (frontend) tidak boleh
> perlu ubah kode hanya karena Upgrade diaktifkan.

### 🏗️ BASE Tasks
- [ ] Setup project struktur: `backend/main.py`, `backend/routers/`, `backend/services/`, `backend/schemas/`
- [ ] Install dependensi: `fastapi`, `uvicorn`, `supabase-py`, `python-dotenv`, `pydantic`, `requests`
- [ ] Implementasi endpoint `GET /api/batches` — list semua batch dengan filter opsional (store_id, risk_label, route)
- [ ] Implementasi endpoint `GET /api/batches/{batch_id}` — detail satu batch + event history-nya
- [ ] Implementasi endpoint `GET /api/dashboard/summary` — KPI: total batch, total waste saved, avg risk score, dispatch success rate
- [ ] Implementasi endpoint `GET /api/dispatch` — list dispatch log dengan filter status
- [ ] Implementasi endpoint `GET /api/receivers` — list semua penerima + kapasitas tersisa
- [ ] Implementasi endpoint `GET /api/dispatch/{batch_id}/route` — panggil OSRM dan kembalikan jarak, ETA, & polyline GeoJSON untuk Leaflet
- [ ] Setup CORS: izinkan request dari domain frontend
- [ ] Setup Supabase auth middleware: endpoint `/api/simulate/run` dan `/api/admin/*` hanya bisa diakses dengan Supabase JWT
- [ ] Tambahkan OpenAPI docs otomatis di `/docs` (default FastAPI)
- [ ] Test semua endpoint via Swagger UI (`/docs`)

### 🚀 UPGRADE Tasks (Skala Multi-Toko)
- [ ] Implementasi endpoint `GET /api/multi-store/routes` — agregasi seluruh rute dispatch antar-cabang toko
- [ ] Implementasi endpoint `POST /api/simulate/run` — trigger ulang simulasi Python (subprocess call ke WORKSTEPS pipeline)

### 💡 OPSIONAL Tasks (Stretch Goals)
- [ ] Implementasi endpoint `GET /api/clusters` — hasil clustering K-Means per entity type
- [ ] Implementasi WebSocket / SSE streaming telemetri simulasi

---

## Step A4 — Frontend Dashboard (Next.js)

**Goal:** Dashboard yang bisa diakses publik (read-only) untuk memvisualisasikan hasil 6-langkah PDF dan rute pengiriman donasi riil di peta interaktif.

**Stack:** Next.js (App Router) + Tailwind CSS + Recharts / Chart.js + Leaflet.js (`react-leaflet`) + Supabase JS client

### 🏗️ BASE Tasks
*(Sesuai 6-langkah alur di `Alur_Penggunaan_Sistem.pdf` + Visualisasi GIS Leaflet)*
- [ ] Init project: `npx create-next-app@latest frontend --typescript --tailwind --app`
- [ ] Install dependensi: `@supabase/supabase-js`, `recharts`, `leaflet`, `react-leaflet`, `@types/leaflet`
- [ ] Setup Supabase client di `lib/supabase.ts` dengan env vars
- [ ] Buat halaman `/dashboard` — layout utama dengan sidebar navigasi
- [ ] Implementasi KPI Cards: Total Batch, Waste Saved (kg), Avg Risk Score, Dispatch Success Rate — data dari `/api/dashboard/summary`
- [ ] Implementasi chart: Waste Risk Distribution (Bar/Pie chart) — distribusi HIGH/MEDIUM/LOW per kategori
- [ ] Implementasi chart: Batch Route Funnel — berapa batch di tiap jalur (normal_sale → discount → donation → wasted)
- [ ] Implementasi chart: Demand Forecast vs Aktual (Line chart) — output Step 8
- [ ] Implementasi tabel Batch List: filter by store, category, risk_label, route, serta badge skor probabilitas waste
- [ ] **Implementasi Peta Interaktif Leaflet JS (Langkah 5 PDF):**
  - Plot marker toko asal (ikon toko)
  - Plot marker food bank/penerima terpilih (ikon food bank)
  - Gambar garis rute jalan riil (*polyline*) dari data GeoJSON OSRM backend
  - Tampilkan popup info interaktif: jarak tempuh (km), estimasi durasi (ETA menit), dan status pengiriman
- [ ] Implementasi real-time update: subscribe Supabase Realtime pada tabel `simulation_events`
- [ ] Responsive design: pastikan tampil baik di desktop & tablet
- [ ] Deploy ke Vercel: `vercel deploy` + set env vars di Vercel dashboard

### 🚀 UPGRADE Tasks (Skala Multi-Toko)
- [ ] Tambahkan layer visualisasi seluruh armada pengiriman multi-store di peta Leaflet
- [ ] Filter rute peta berdasarkan `store_id` cabang

### 💡 OPSIONAL Tasks (Stretch Goals)
- [ ] Tambah **Tab "Klaster Toko"**: scatter plot klaster K-Means toko berdasarkan waste rate & velocity
- [ ] Visualisasi analisis komparasi multi-store

---

## Step A5 — Developer / CMS Page (Admin Panel) 🏗️ BASE

**Goal:** Halaman khusus yang dilindungi auth untuk: monitor simulasi, trigger ulang run, edit parameter, lihat raw log, dan manage daftar penerima — semua dari browser tanpa perlu buka terminal.

**Stack:** Next.js (route `/admin`) + Supabase Auth (magic link / email+password)

### 🏗️ BASE Tasks

#### Auth
- [ ] Setup Supabase Auth: aktifkan Email provider di Supabase dashboard
- [ ] Buat halaman `/admin/login` — form email + password / magic link
- [ ] Implementasi middleware Next.js: redirect ke `/admin/login` jika tidak ada Supabase session
- [ ] Buat halaman `/admin` — layout admin dengan header "Developer Console"

#### Simulation Control Dasar
- [ ] Implementasi panel "Run Simulation": form parameter (horizon hari, jumlah toko, seed) → POST `/api/simulate/run`
- [ ] Tampilkan status run terakhir: timestamp, duration, jumlah batch generated, errors

#### Data Management
- [ ] Implementasi tabel `Receivers Management`: tambah / edit / hapus penerima (food bank, pantry, kafe)
- [ ] Implementasi tabel `Batches Raw View`: lihat semua batch dengan semua kolom, bisa export CSV
- [ ] Implementasi tabel `Dispatch Log`: filter by status (success/failed/pending), bisa update status manual

#### Monitoring Dasar
- [ ] Implementasi halaman `/admin/models` — info model ML: versi, tanggal training, metrik evaluasi (F1, RMSE, dll.)
- [ ] Implementasi halaman `/admin/logs` — raw event log `simulation_events` dengan search & filter

#### Deployment
- [ ] Pastikan route `/admin/*` tidak terindex oleh search engine (`robots.txt`)
- [ ] Test full auth flow: login → akses admin → logout
- [ ] Deploy bersama frontend ke Vercel (satu project, route terpisah)

### 💡 OPSIONAL Tasks (Stretch Goals)
- [ ] Tampilkan live log output simulasi streaming dari backend via SSE / WebSocket (cukup log statis di BASE)
- [ ] Implementasi halaman `/admin/clusters` — visualisasi hasil clustering dengan scatter plot interaktif

---

## Struktur Folder Akhir

```
final-ait201/
├── data/                    # dataset mentah (gitignore besar)
├── notebooks/               # Step 7-14 Jupyter Notebooks
├── models/                  # trained model files (.pkl/.joblib)
├── output/                  # CSV output simulator
│   ├── canonical_batch_table.csv    # BASE output
│   ├── simulation_events.csv        # UPGRADE output
│   └── dispatch_log.csv             # UPGRADE output
├── ingest/                  # Step A2: upload scripts
│   ├── upload_batches.py    # BASE
│   ├── upload_events.py     # UPGRADE
│   ├── upload_dispatch.py   # UPGRADE
│   ├── upload_clusters.py   # UPGRADE
│   └── run_all.py           # UPGRADE
├── backend/                 # Step A3: FastAPI
│   ├── main.py
│   ├── routers/
│   ├── services/
│   └── schemas/
├── frontend/                # Step A4 & A5: Next.js
│   ├── app/
│   │   ├── dashboard/
│   │   └── admin/
│   ├── components/
│   └── lib/
│       └── supabase.ts
├── .env                     # SUPABASE_URL, SUPABASE_ANON_KEY, dll.
├── WORKSTEPS.md             # ML/data pipeline steps
└── WORKSTEPS_APP.md         # File ini
```

---

## Progress Tracker

| Step | Phase | Status |
|---|---|---|
| Step A1 — Supabase Schema | 🏗️ BASE | ⬜ Belum dimulai |
| Step A2 — Data Ingestion (batches only) | 🏗️ BASE | ⬜ Belum dimulai |
| Step A2 — Data Ingestion (events + dispatch) | 🚀 UPGRADE | ⬜ Belum dimulai |
| Step A2 — Data Ingestion (clusters) | 💡 OPSIONAL | ⬜ Belum dimulai |
| Step A3 — Backend API (core endpoints) | 🏗️ BASE | ⬜ Belum dimulai |
| Step A3 — Backend API (OSRM dispatch + waste risk) | 🚀 UPGRADE | ⬜ Belum dimulai |
| Step A3 — Backend API (cluster analysis) | 💡 OPSIONAL | ⬜ Belum dimulai |
| Step A4 — Frontend Dashboard (6-langkah PDF) | 🏗️ BASE | ⬜ Belum dimulai |
| Step A4 — Frontend (Tab Peta Rute OSRM) | 🚀 UPGRADE | ⬜ Belum dimulai |
| Step A4 — Frontend (Tab Klaster Toko K-Means) | 💡 OPSIONAL | ⬜ Belum dimulai |
| Step A5 — Developer/CMS Page Dasar | 🏗️ BASE | ⬜ Belum dimulai |
| Step A5 — SSE Live Streaming & Advanced Clusters | 💡 OPSIONAL | ⬜ Belum dimulai |

> **Catatan urutan:** A1 → A2 → A3 → A4 → A5. Jangan mulai A2 sebelum minimal Step 10 di WORKSTEPS.md
> selesai (butuh output CSV). BASE bisa demo tanpa Upgrade aktif sama sekali.
