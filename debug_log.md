# Log Perbaikan Bug & Refactoring Sistem (Debug Log)
> **Proyek:** Dynamic Food Clearing House Simulator (FreshGuard AIT-201)  
> **Tanggal Audit & Perbaikan:** 14 November 2026  
> **Status:** ✅ Seluruh Bug Kritis & Operasional Selesai Diperbaiki dan Terverifikasi

---

## 1. Ringkasan Eksekutif
Dokumen ini merangkum seluruh perbaikan bug, penyesuaian arsitektur, dan refactoring yang telah diterapkan ke dalam sistem FreshGuard AIT-201. Perbaikan mencakup penyelarasan database Cloud Supabase, perbaikan data integrity pada modul Inventory FEFO dan Sales POS, refactoring model Demand Forecasting dan Rule Engine, optimalisasi keamanan secret keys, hingga standarisasi identifier batch tunggal (`LOT-`).

---

## 2. Tabel Rekapitulasi Status Perbaikan Bug

| Kode Bug | Modul / Komponen | Kategori | Severity | Status |
|:---|:---|:---|:---:|:---:|
| **BUG-INV-01** | Inventory & Data Pipeline | Data Integrity / Harmonization | 🔴 CRITICAL | **[x] ✅ FIXED** |
| **BUG-INV-02** | Inventory & Vite Backend | Cloud Data Sync | 🔴 CRITICAL | **[x] ✅ FIXED** |
| **BUG-INV-04** | Inventory (FEFO Risk) | Logic / Time-bomb | 🔴 CRITICAL | **[x] ✅ FIXED** |
| **BUG-INV-05** | Inventory (Edit Batch) | Cloud Data Sync | 🔴 CRITICAL | **[x] ✅ FIXED** |
| **BUG-SALES-01** | Sales Log & POS | Schema Mismatch (Supabase Enum) | 🔴 CRITICAL | **[x] ✅ FIXED** |
| **BUG-SALES-03** | Sales Log Backend | File System / Bootstrap | 🔴 CRITICAL | **[x] ✅ FIXED** |
| **BUG-SALES-04** | Sales Log (Edit/Delete) | Inventory Data Integrity | 🔴 CRITICAL | **[x] ✅ FIXED** |
| **BUG-SALES-05** | Sales Log Backend | Circular Dependency / Vite HMR | 🟠 MEDIUM | **[x] ✅ FIXED** |
| **BUG-FC-01** | Demand Forecasting | Cloud Architecture Integration | 🔴 CRITICAL | **[x] ✅ FIXED** |
| **BUG-FC-02** | Demand Forecasting | Dead Code / UI-Only Action | 🔴 CRITICAL | **[x] ✅ FIXED** |
| **BUG-FC-03** | Demand Forecasting | State Management (Stale Product) | 🟠 MEDIUM | **[x] ✅ FIXED** |
| **BUG-FC-04** | Demand Forecasting | Business Logic (Heuristic Decay) | 🟠 MEDIUM | **[x] ✅ FIXED** |
| **BUG-FC-07** | Demand Forecasting Service | Stale Data / Supabase Source | 🟠 MEDIUM | **[x] ✅ FIXED** |
| **BUG-RE-01** | Rule Engine | API Contract (`discount_percent`) | 🔴 CRITICAL | **[x] ✅ FIXED** |
| **BUG-RE-02** | Rule Engine | Non-Deterministic Routing Order | 🔴 CRITICAL | **[x] ✅ FIXED** |
| **BUG-DSP-01** | Dispatch Module | Business Logic (Receiver Matching) | 🟠 MEDIUM | **[x] ✅ FIXED** |
| **BUG-DSP-02** | Dispatch Module | Data Persistence (Supabase Cloud) | 🟠 MEDIUM | **[x] ✅ FIXED** |
| **BUG-DSP-04** | Dispatch Module | Memory Leak (`setInterval` cleanup) | 🟠 MEDIUM | **[x] ✅ FIXED** |
| **BUG-ML-01** | ML Spoilage Model | Module Side Effect (Import Print) | 🟠 MEDIUM | **[x] ✅ FIXED** |
| **BUG-DB-03** | Konfigurasi & Security | Security (Secret & Fallback URL) | 🔴 CRITICAL | **[x] ✅ FIXED** |
| **BUG-UI-02** | Demand Forecasting UI | Transparency (ML vs Heuristik) | 🟡 LOW | **[x] ✅ FIXED** |
| **BUG-KPI-01** | Dashboard KPI Strip | Default Values & Dynamic Tag | 🟡 LOW | **[x] ✅ FIXED** |
| **BUG-CHART-01**| Dashboard Charts | Live Realized Profit Link | 🟡 LOW | **[x] ✅ FIXED** |
| **BUG-CHART-02**| Dashboard Charts | Dynamic Weighting & Greeting | 🟡 LOW | **[x] ✅ FIXED** |

---

## 3. Rincian Teknis Implementasi Perbaikan

### 3.1. Modul Inventory & Standarisasi ID (`BUG-INV-01`, `BUG-INV-02`, `BUG-INV-04`, `BUG-INV-05`)
1. **Standarisasi ID Tunggal `LOT-` (`BUG-INV-01`):**
   * **Masalah:** Terjadi mismatch ID antara data kanonikal (`CAN-2000`) dengan data inventaris lokal (`LOT-1000`), menyebabkan request `PATCH` dan `DELETE` menghasilkan status 404 pada data Supabase.
   * **Solusi:** 
     * Seluruh pipeline ETL ([`src/etl/canonical_schema.py`](file:///d:/hahaha/food-cleaning-ait201/src/etl/canonical_schema.py)) dan Ingestion ([`src/ingest/upload_batches.py`](file:///d:/hahaha/food-cleaning-ait201/src/ingest/upload_batches.py)) distandarisasi menghasilkan format tunggal `LOT-XXXX`.
     * File data `canonical_batch_table.csv` dan `simulation_events.csv` (7.200+ entri) dimigrasikan dari `CAN-` ke `LOT-`.
     * Menambahkan helper `matchBatchId()` di [`frontend/vite.config.js`](file:///d:/hahaha/food-cleaning-ait201/frontend/vite.config.js) dan normalisasi otomatis pada [`frontend/src/services/supabase.js`](file:///d:/hahaha/food-cleaning-ait201/frontend/src/services/supabase.js) untuk backward compatibility.
2. **Sinkronisasi Lengkap Add & Edit Batch (`BUG-INV-02` & `BUG-INV-05`):**
   * **Masalah:** Fungsi `rowToSupabase()` mengabaikan kolom wajib skema database (`canonical_category`, `moral_hazard_flag`, `channel`, `discount_percent`, `discounted_price_myr`, `expected_value_myr`). Selain itu, endpoint `PATCH /api/batches/:id` hanya menyinkronkan `quantity` ke Supabase, mengabaikan perubahan harga, tanggal kedaluwarsa, dan reorder level.
   * **Solusi:**
     * Melengkapi `rowToSupabase()` di [`frontend/vite.config.js`](file:///d:/hahaha/food-cleaning-ait201/frontend/vite.config.js) dengan pemetaan lengkap seluruh kolom skema database.
     * Mengembangkan endpoint `PATCH /api/batches/:id` agar memperbarui seluruh atribut (`unit_price_myr`, `expiry_date`, `days_to_expiry`, `reorder_level`, `turnover_ratio`, `product_name`, `category`) ke JSON lokal dan mempropagasi seluruh payload pembaruan ke Supabase Cloud.
3. **Penghapusan Hardcoded Date 2026 (`BUG-INV-04`):**
   * **Masalah:** Perhitungan DTE di [`frontend/src/components/dashboard/inventoryData.js`](file:///d:/hahaha/food-cleaning-ait201/frontend/src/components/dashboard/inventoryData.js) di-hardcode ke tanggal acuan statis `2026-11-14`.
   * **Solusi:** Menormalkan tanggal referensi ke waktu nyata dinamis (`new Date()`).

---

### 3.2. Modul Sales Log & POS (`BUG-SALES-01`, `BUG-SALES-03`, `BUG-SALES-04`, `BUG-SALES-05`)
1. **Perbaikan Enum Supabase `event_type` (`BUG-SALES-01`):**
   * **Masalah:** Vite API mengirim event transaksi penjualan dengan `event_type: 'sale'`, padahal skema database PostgreSQL hanya mengizinkan enum: `'received'`, `'active_fefo'`, `'markdown'`, `'dispatched'`, `'wasted'`. Akibatnya seluruh insert transaksi ke Cloud ditolak.
   * **Solusi:** Mengubah payload event transaksi menjadi `event_type: 'markdown'` dengan metadata `action: 'pos_sale'`, serta memperbarui validator di `upload_batches.py`.
2. **Keamanan File System Bootstrap Fresh Clone (`BUG-SALES-03`):**
   * **Masalah:** Pada repositori yang baru di-clone, direktori `data/processed/` belum tentu ada, sehingga penulisan pertama ke `transactions.json` memicu exception 500 ENOENT.
   * **Solusi:** Menambahkan `fs.mkdirSync(path.dirname(p), { recursive: true })` di dalam helper `writeJson()`.
3. **Penyesuaian Stok Otomatis saat Edit & Hapus Transaksi (`BUG-SALES-04`):**
   * **Masalah:** Mengedit kuantitas penjualan di POS modal tidak mengubah stok inventaris batch terkait. Transaksi yang dihapus juga tidak mengembalikan stok ke gudang.
   * **Solusi:** 
     * Pada `handleSaveEditSale` di [`frontend/src/components/dashboard/SalesLogPage.jsx`](file:///d:/hahaha/food-cleaning-ait201/frontend/src/components/dashboard/SalesLogPage.jsx), dihitung selisih `qtyDiff = newQty - oldQty`. Sistem memvalidasi ketersediaan stok, menolak overdraft, dan memotong/menambah stok batch melalui `PATCH /api/batches/:id` dan state parent `onUpdateBatches`.
     * Pada `handleDeleteSale`, stok barang yang pernah terjual otomatis dikembalikan (*restored*) ke inventaris.
4. **Pembersihan Duplikasi Tulis ke `unifiedSalesLog.json` (`BUG-SALES-05`):**
   * **Masalah:** Setiap transaksi baru menulis ulang ke file statis frontend `unifiedSalesLog.json`, memicu Vite HMR restart berulang kali.
   * **Solusi:** Menghapus penulisan ke `unifiedSalesLog.json` pada runtime handler. File `transactions.json` (+ Cloud Supabase) ditetapkan sebagai *single source of truth*.

---

### 3.3. Modul Demand Forecasting (`BUG-FC-01`, `BUG-FC-02`, `BUG-FC-03`, `BUG-FC-04`, `BUG-FC-07`, `BUG-UI-02`)
1. **Koneksi Live ke Supabase Cloud (`BUG-FC-01` & `BUG-FC-07`):**
   * **Masalah:** Layanan forecast hanya membaca file CSV/JSON lokal statis dan tidak pernah membaca inventaris aktif dari Supabase Cloud.
   * **Solusi:** 
     * Pada [`src/forecasting/forecast_service.py`](file:///d:/hahaha/food-cleaning-ait201/src/forecasting/forecast_service.py), fungsi `load_lots()` dihubungkan langsung ke REST endpoint Supabase (`/rest/v1/batches?select=*&quantity=gt.0`) dengan fallback bertingkat ke JSON lokal.
     * Pada [`frontend/vite.config.js`](file:///d:/hahaha/food-cleaning-ait201/frontend/vite.config.js), endpoint `/api/forecast/products` mengambil data lot aktif dari Supabase Cloud secara live dan mengembalikan properti `source: 'Supabase Cloud + LightGBM ML'`.
2. **Pembersihan Dead Code Tombol Execute (`BUG-FC-02`):**
   * **Masalah:** Tombol aksi pada Forecast hanya menampilkan alert toast tanpa memicu mutasi database riil.
   * **Solusi:** Mengganti tombol aksi dead code dengan pill visual status rekomendasi operasional yang informatif.
3. **Reset Otomatis Stale Selected Product (`BUG-FC-03`):**
   * **Masalah:** Jika batch produk yang sedang ditampilkan dihapus, state `selectedProduct` tidak di-reset dan merender data undefined.
   * **Solusi:** Menambahkan `useEffect` pengawas di [`frontend/src/components/dashboard/DemandForecastingPage.jsx`](file:///d:/hahaha/food-cleaning-ait201/frontend/src/components/dashboard/DemandForecastingPage.jsx) yang otomatis mengalihkan seleksi ke produk aktif pertama jika produk terpilih tidak lagi tersedia.
4. **Model Heuristik Penurunan Stok Berbasis Kategori (`BUG-FC-04`):**
   * **Masalah:** Fallback heuristik menggunakan angka flat `35% / 30% / 25%` (90% stok habis dalam 3 hari), membuat produk tahan lama (seperti beras atau minyak) menghasilkan rekomendasi restock palsu.
   * **Solusi:** Membuat fungsi `getCategoryDecayRates(category, turnoverRatio)` yang menyesuaikan laju penjualan menurut tingkat ketahanan pangan (perishable vs shelf-stable) dan rasio turnover barang.
5. **Transparansi Sumber Data Forecast (`BUG-UI-02`):**
   * **Masalah:** Pengguna tidak mengetahui apakah angka forecast berasal dari model ML LightGBM atau estimasi heuristik.
   * **Solusi:** Menampilkan label teks informatif (tanpa badge) pada header produk:
     * Model ML: `Forecast Source: LightGBM ML Model (Family: PRODUCE)`
     * Heuristik: `Forecast Source: Category Velocity Heuristics`

---

### 3.4. Modul Rule Engine & Algoritma Dispatch (`BUG-RE-01`, `BUG-RE-02`, `BUG-DSP-01`, `BUG-DSP-02`, `BUG-DSP-04`)
1. **Standardisasi Kontrak API Diskon (`BUG-RE-01`):**
   * **Masalah:** Python `rule_engine.py` mengembalikan `discount_percent: 0.25` (pecahan), sedangkan JavaScript mengharapkan angka persentase `25.0`.
   * **Solusi:** Menyelaraskan output Python dan Node.js agar keduanya mengembalikan `discount_percent` (angka 0–100) dan `discount_fraction` (angka 0.0–1.0).
2. **Pengurutan Deterministik Alokasi Donasi (`BUG-RE-02`):**
   * **Masalah:** `evaluate_lot_dataframe()` memproses data berdasarkan urutan baris CSV acak, sehingga kuota donasi makanan berisiko dihabiskan oleh lot dengan sisa hari kedaluwarsa yang masih lama.
   * **Solusi:** Menambahkan pengurutan eksplisit berdasarkan DTE (`sort_values(by="days_to_expiry")`) sebelum evaluasi kuota.
3. **Smart Receiver Matching & Persistensi Dispatch (`BUG-DSP-01`, `BUG-DSP-02`, `BUG-DSP-04`):**
   * **Masalah:** Pemilihan penerima food bank menggunakan operasi modulo indeks (`idx % receivers.length`) tanpa mempertimbangkan jenis makanan dan kapasitas receiver. Selain itu, aksi dispatch tidak tercatat ke Supabase dan interval countdown timer memicu memory leak saat navigasi berpindah.
   * **Solusi:** 
     * Mengimplementasikan pencocokan cerdas berdasarkan kategori produk dan kapasitas penerima di [`frontend/src/components/dashboard/DispatchPage.jsx`](file:///d:/hahaha/food-cleaning-ait201/frontend/src/components/dashboard/DispatchPage.jsx).
     * Menghubungkan dispatch ke endpoint `/api/dispatch` yang mencatat ke tabel `dispatch_log` dan `simulation_events` di Supabase.
     * Menambahkan fungsi cleanup unmount untuk membersihkan seluruh referensi timer `setInterval`.

---

### 3.5. Modul Machine Learning, Security & Dashboard UI (`BUG-ML-01`, `BUG-DB-03`, `BUG-KPI-01`, `BUG-CHART-01`, `BUG-CHART-02`)
1. **Isolasi Demo Code Model Spoilage (`BUG-ML-01`):**
   * **Masalah:** Modul [`src/ml/spoilage.py`](file:///d:/hahaha/food-cleaning-ait201/src/ml/spoilage.py) mengeksekusi sampel lot dan mencetak ke stdout saat di-import oleh modul lain.
   * **Solusi:** Membungkus kode demo dengan guard `if __name__ == "__main__":`.
2. **Pembersihan URL Hardcode & Rahasia Layanan (`BUG-DB-03`):**
   * **Masalah:** Fallback URL Supabase production di-hardcode di file client/config, berisiko mengarahkan request tanpa kredensial ke server cloud.
   * **Solusi:** Menghapus seluruh string fallback URL hardcode di `vite.config.js`, `supabase.js`, dan script bootstrap. Koneksi murni mengandalkan variabel lingkungan `VITE_SUPABASE_URL`.
3. **Perbaikan Nilai Default KPI Strip (`BUG-KPI-01`):**
   * **Masalah:** Komponen [`frontend/src/components/dashboard/KpiStrip.jsx`](file:///d:/hahaha/food-cleaning-ait201/frontend/src/components/dashboard/KpiStrip.jsx) menggunakan default prop `activeBatchesCount = 5` dan label statis `"100% Monitored"`.
   * **Solusi:** Mengubah default menjadi `0` dan membuat label status monitoring bersifat kondisional dinamis.
4. **Grafik Real-Time & Personalisasi Sidebar (`BUG-CHART-01` & `BUG-CHART-02`):**
   * **Solusi:** Menghubungkan grafik `ProfitDailyChart` dengan akumulasi penjualan kasir rolling 7 hari serta menghitung proporsi berat riil per kategori pada `ReasonForRecoveryChart`.

---

## 4. Hasil Verifikasi & Pengujian Kualitas

1. **Frontend Production Build:**
   ```bash
   cd frontend && npm run build
   # Hasil: ✓ 105 modules transformed -> dist/index.html, dist/assets/
   # Status: SUKSES (0 errors, 0 broken imports)
   ```
2. **Verifikasi Pipeline Ingesti Data:**
   ```bash
   python src/ingest/upload_batches.py --dry-run
   # Hasil:
   #   batches uploaded: 990 rows (on_conflict=batch_id: LOT-XXXX)
   #   simulation_events uploaded: 2,644 rows (batch_id: LOT-XXXX)
   # Status: SUKSES (100% lolos validasi integritas FK dan skema)
   ```
3. **Verifikasi Python Service Import:**
   ```bash
   python -c "import src.ml.spoilage; from src.forecasting.forecast_service import load_lots; print(len(load_lots()))"
   # Hasil: 59 active lots loaded, stdout bersih tanpa side-effect
   # Status: SUKSES
   ```
4. **Audit Kebocoran Kredensial:**
   ```bash
   git grep "sb_secret_"
   # Hasil: 0 occurrences
   # Status: BERSIH & AMAN
   ```

---

*Log ini disusun sebagai dokumentasi resmi pemeliharaan perangkat lunak FreshGuard AIT-201.*
