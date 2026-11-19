# 🐛 Laporan Bug Lengkap — FreshGuard (final-ait201)
### Inventory · Sales Log · Demand Forecasting · Supabase Storage

> **Tanggal Audit :** 14 November 2026  
> **Codebase :** `final-ait201`  
> **Scope :** Seluruh fitur frontend + backend + koneksi Supabase  
> **Status :** ⚠️ **DOKUMENTASI SAJA — BELUM ADA YANG DIPERBAIKI**

---

## Daftar Isi
1. [Ringkasan Eksekutif](#ringkasan-eksekutif)
2. [🔴 Bug Kritis — INVENTORY](#-bug-kritis--inventory)
3. [🔴 Bug Kritis — SALES LOG](#-bug-kritis--sales-log)
4. [🔴 Bug Kritis — FORECAST](#-bug-kritis--forecast)
5. [🔴 Bug Kritis — RULE ENGINE](#-bug-kritis--rule-engine)
6. [🟠 Bug Medium — SUPABASE STORAGE](#-bug-medium--supabase-storage)
7. [🟠 Bug Medium — DATABASE & SYNC](#-bug-medium--database--sync)
8. [🟠 Bug Medium — DISPATCH PAGE](#-bug-medium--dispatch-page)
9. [🟠 Bug Medium — ML / SPOILAGE MODEL](#-bug-medium--ml--spoilage-model)
10. [🟡 Bug Minor — UI/UX](#-bug-minor--uiux)
11. [🟡 Bug Minor — ACTIVITIES & CHARTS](#-bug-minor--activities--charts)
12. [Tabel Rekapitulasi](#tabel-rekapitulasi)

---

## Ringkasan Eksekutif

Audit menyeluruh terhadap fitur **Inventory (FEFO)**, **Sales Log (POS)**, **Demand Forecasting**, **Dispatch**, **Rule Engine**, dan **ML Model** menemukan **43 bug** yang terdistribusi dari level kritis hingga minor. Temuan paling signifikan adalah:

- **Supabase Storage tidak digunakan sama sekali** — padahal arsitektur mengandalkan Supabase sebagai database utama
- **Transaksi Sales tidak disync ke Supabase** menggunakan event type yang salah (`sale` bukan enum yang valid)
- **Forecast tidak terhubung ke Supabase** sama sekali — hanya membaca file JSON lokal
- **Cashier hardcode `'John Doe'`** di setiap transaksi POS
- **Data inventory duplikat** antara Supabase Cloud dan `inventory_master.json` lokal tanpa reconciliation
- **Rule Engine Python vs JS mengembalikan response shape berbeda** — `discount_percent` bermakna berbeda (fraction vs persen)
- **Dispatch Page: receiver assignment menggunakan modulo index** — tidak ada logic matching berdasarkan kapasitas/jenis makanan
- **ML `spoilage.py` dijalankan saat import** — demo code di module level menyebabkan side effect
- **Dashboard charts 100% hardcode** — `FoodRescuedTrendChart`, `ReasonForRecoveryChart`, `KpiStrip` tidak terhubung ke data nyata

---

## 🔴 Bug Kritis — INVENTORY

### BUG-INV-01 · ID Batch Mismatch antara Supabase dan JSON Lokal

| | |
|---|---|
| **File** | `frontend/src/services/supabase.js` baris 20 · `frontend/vite.config.js` baris 92 |
| **Severity** | 🔴 CRITICAL |
| **Kategori** | Data Integrity |

**Deskripsi:**  
Supabase menggunakan kolom `batch_id` (format `CAN-XXXX` atau `LOT-XXXX`) sebagai primary key, tetapi file JSON lokal `inventory_master.json` menggunakan `lot_id` (format `LOT-XXXX`). Mapping di `supabaseRowToBatch()`:

```javascript
// supabase.js baris 20 — mengambil batch_id ATAU lot_id
id: r.batch_id || r.lot_id,
```

Sedangkan `vite.config.js` (rowToBatch) hanya menggunakan:

```javascript
// vite.config.js baris 53
id: r.lot_id,
```

Ketika frontend mengirim `PATCH /api/batches/LOT-1000`, vite middleware mencari `lot_id === 'LOT-1000'` di JSON lokal. Tapi jika data berasal dari Supabase (via `supabaseRowToBatch`), `batch.id` bisa jadi `CAN-1000`. Maka **PATCH akan gagal dengan 404** karena `CAN-1000` tidak ada di JSON lokal.

**Dampak :**  
- Stok tidak ter-update di local JSON setelah action Markdown/Donate dari data Supabase
- Quantity di Supabase dan JSON lokal menjadi tidak sinkron

---

### BUG-INV-02 · `handleAddBatch` Tidak Sync ke Supabase

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/DashboardPage.jsx` baris 249–268 |
| **Severity** | 🔴 CRITICAL |
| **Kategori** | Data Sync |

**Deskripsi:**  
Ketika user menambah batch baru via form "Add Batch", data di-POST ke `/api/batches` (JSON lokal). Di `vite.config.js` baris 239, ada `syncToSupabase('UPSERT', rowToSupabase(row))` yang seharusnya sync ke Supabase.

**Masalahnya:** `rowToSupabase()` di `vite.config.js` baris 151–178 tidak menyertakan field `canonical_category`, `moral_hazard_flag`, `channel`, dan `discount_percent` yang ada di schema Supabase. Akibatnya upsert ke Supabase **akan gagal validasi** jika kolom-kolom tersebut memiliki NOT NULL constraint, atau tersimpan dengan nilai default yang salah.

```javascript
// vite.config.js — rowToSupabase() TIDAK menyertakan:
// canonical_category, moral_hazard_flag, channel, discount_percent
// expected_value_myr, discounted_price_myr
```

**Dampak :**  
- Batch baru yang ditambah user tidak tercatat dengan benar di Supabase Cloud
- Dashboard summary dari Supabase view `v_dashboard_summary` menampilkan data salah

---

### BUG-INV-03 · Delete Batch Tidak Dicek RLS Policy

| | |
|---|---|
| **File** | `frontend/vite.config.js` baris 193–210 · `database/schema.sql` baris 257–259 |
| **Severity** | 🔴 CRITICAL |
| **Kategori** | Security / RLS |

**Deskripsi:**  
`syncToSupabase('DELETE', lotId)` di `vite.config.js` menggunakan `SUPABASE_SERVICE_ROLE_KEY` yang **bypass Row Level Security**. Ini berarti setiap delete dari Vite dev server menghapus data di Supabase **tanpa melalui RLS policy** `auth_write_batches`.

```javascript
// vite.config.js baris 183–186
const headers = {
  apikey: SUPABASE_KEY,          // Service Role Key — bypass RLS!
  Authorization: `Bearer ${SUPABASE_KEY}`,
  ...
}
```

Schema sudah mendefinisikan policy yang membatasi write ke `service_role` atau `authenticated`, tapi tidak ada mekanisme audit log siapa yang melakukan delete.

**Dampak :**  
- Tidak ada audit trail untuk delete operasi
- Jika ada bug di UI (mis. accidental delete), data di Supabase langsung hilang tanpa rollback

---

### BUG-INV-04 · `parseDateToDays()` Hard-code Tahun 2026

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/inventoryData.js` baris 11 |
| **Severity** | 🔴 CRITICAL |
| **Kategori** | Logic Bug / Time-bomb |

**Deskripsi:**  
Fungsi `parseDateToDays` yang digunakan untuk menghitung DTE (Days to Expiry) memiliki logika khusus untuk tahun 2026:

```javascript
// inventoryData.js baris 11-12
const baseYear = expDate.getFullYear()
const now = new Date()
const refDate = (baseYear === 2026) ? new Date('2026-11-14') : now
// ↑ BUG: tanggal referensi di-hardcode '2026-11-14'!
```

Ini berarti DTE untuk semua produk yang expire di tahun 2026 selalu dihitung relatif terhadap tanggal `2026-11-14` (hari pembuatan kode), **bukan tanggal hari ini**. Jika user membuka dashboard pada `2026-11-20`, produk yang expire `2026-11-15` seharusnya sudah expired (DTE < 0), tapi malah dihitung sebagai DTE = 1.

**Dampak :**  
- Risk classification (High/Med/Low) tidak akurat
- Produk kadaluarsa mungkin masih muncul sebagai "Low Risk"
- FEFO sort order menjadi salah

---

### BUG-INV-05 · Edit Batch Tidak Sync ke Supabase

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/InventoryFefoRiskPage.jsx` baris 499–504 |
| **Severity** | 🔴 CRITICAL |
| **Kategori** | Data Sync |

**Deskripsi:**  
Ketika user mengedit batch (harga, qty, expiry), data di-POST ke `/api/batches` (JSON lokal). Vite server memprosesnya sebagai upsert ke JSON. Namun `syncToSupabase` yang dipanggil di vite backend **tidak mempropagasi perubahan harga** (`unit_price_myr`) ke Supabase:

```javascript
// vite.config.js baris 280–283 — PATCH hanya kirim quantity!
const updates = { batch_id: lotId, quantity: Number(records[idx].quantity) }
if (records[idx].unit_price_myr) {
  updates.unit_price_myr = parseFloat(records[idx].unit_price_myr)
}
// Perubahan field lain (expiry_date, reorder_level, dll) TIDAK di-sync!
```

**Dampak :**  
- Supabase Cloud tidak ter-update dengan perubahan expiry date, reorder level, turnover ratio
- Data Supabase dan JSON lokal divergen setelah edit

---

## 🔴 Bug Kritis — SALES LOG

### BUG-SALES-01 · `event_type: 'sale'` Tidak Ada di Enum Supabase

| | |
|---|---|
| **File** | `frontend/vite.config.js` baris 343 · `database/schema.sql` baris 97–99 |
| **Severity** | 🔴 CRITICAL |
| **Kategori** | Schema Mismatch |

**Deskripsi:**  
Ketika sale direcord, Vite server mengirim event ke Supabase `simulation_events` table dengan `event_type: 'sale'`:

```javascript
// vite.config.js baris 343
event_type: 'sale',
```

Namun schema database mendefinisikan enum yang valid hanya:

```sql
-- schema.sql baris 97-99
-- 'received' | 'active_fefo' | 'markdown' | 'dispatched' | 'wasted'
```

**`'sale'` TIDAK ADA di valid enum!** Ini berarti setiap transaksi POS yang dicatat akan **gagal insert** ke `simulation_events` di Supabase (atau tersimpan dengan nilai tidak valid tergantung konfigurasi constraint).

**Dampak :**  
- Seluruh history transaksi POS tidak tercatat di Supabase
- Dashboard summary Supabase tidak mencerminkan data penjualan nyata
- `validate_events()` di `upload_batches.py` juga akan reject `'sale'` event

---

### BUG-SALES-02 · Cashier Hardcode `'John Doe'`

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/SalesLogPage.jsx` baris 313 |
| **Severity** | 🔴 CRITICAL |
| **Kategori** | Business Logic |

**Deskripsi:**  
Semua transaksi POS di-assign ke satu cashier yang hardcode:

```javascript
// SalesLogPage.jsx baris 313
cashier: 'John Doe',
```

Tidak ada mekanisme login/auth/selection untuk cashier. Akibatnya semua transaksi yang tersimpan di `transactions.json`, `unifiedSalesLog.json`, dan Supabase `simulation_events` tercatat dengan cashier yang sama — data tidak berguna untuk analisis per-cashier.

**Dampak :**  
- Laporan penjualan tidak bisa dibedakan antar kasir
- Tidak ada accountability per-kasir di food waste decision

---

### BUG-SALES-03 · `transactions.json` Tidak Pernah Dibuat Jika Belum Ada

| | |
|---|---|
| **File** | `frontend/vite.config.js` baris 7–17 · `frontend/src/components/dashboard/SalesLogPage.jsx` baris 89–96 |
| **Severity** | 🔴 CRITICAL |
| **Kategori** | File System / Bootstrap |

**Deskripsi:**  
`SalesLogPage` pada mount melakukan `fetch('/api/transactions')`, dan `vite.config.js` merespons dengan membaca `transactions.json`:

```javascript
// vite.config.js baris 12-18
function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (_) {
    return []  // ← jika file tidak ada, return []
  }
}
```

Jika file `data/processed/transactions.json` **belum ada** (fresh clone repo), `readJson` mengembalikan `[]`, dan Vite server tidak pernah membuat file tersebut. Ketika user melakukan sale pertama dan data di-POST, `writeJson` mencoba write ke path yang direktori-nya (`data/processed/`) mungkin juga belum ada.

**Dampak :**  
- Transaksi pertama bisa **gagal tersimpan** dengan error 500 jika direktori belum ada
- `unifiedSalesLog.json` juga tidak ter-update

---

### BUG-SALES-04 · Quantity Validation Bisa Dilewati dengan Edit Manual

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/SalesLogPage.jsx` baris 220–251 |
| **Severity** | 🔴 CRITICAL |
| **Kategori** | Data Integrity |

**Deskripsi:**  
`handleSaveEditSale()` memungkinkan user **mengedit qty transaksi yang sudah selesai** tanpa memvalidasi apakah qty baru melebihi stok aktual, dan **tanpa meng-update inventory** (tidak ada PATCH ke `/api/batches`):

```javascript
// SalesLogPage.jsx baris 231–244 — tidak ada inventory adjustment!
const updated = {
  ...editingSale,
  qty, unitPrice, discount, subtotal, discountAmt, total
}
setSales(prev => prev.map(s => s.id === updated.id ? updated : s))
// Persist edit ke backend — HANYA update transaksi, inventory TIDAK di-adjust!
fetch(`/api/transactions/${...}`, { method: 'PATCH', ... })
```

**Dampak :**  
- Stok inventory bisa negatif secara logis (qty terjual > stok tersedia)
- Financial report tidak akurat — revenue berubah tanpa inventory adjustment

---

### BUG-SALES-05 · Duplikasi Write ke `unifiedSalesLog.json`

| | |
|---|---|
| **File** | `frontend/vite.config.js` baris 323–328 · baris 376–380 |
| **Severity** | 🟠 MEDIUM |
| **Kategori** | Data Consistency |

**Deskripsi:**  
Setiap kali ada POST atau PATCH ke `/api/transactions`, Vite server menulis ke **dua file** sekaligus:
1. `data/processed/transactions.json`
2. `frontend/src/data/unifiedSalesLog.json`

```javascript
// vite.config.js baris 323–327
try {
  const unifiedPath = path.resolve(__dirname, 'src/data/unifiedSalesLog.json')
  writeJson(unifiedPath, records)
} catch (_) {}
```

File `unifiedSalesLog.json` adalah file statis yang di-import langsung di `SalesLogPage.jsx` sebagai `INITIAL_SALES`. Ini menciptakan **circular dependency**: data live → bundled static file → initial seed data. Jika file ini diubah, Vite hot-reload akan restart dan data hilang dari state.

**Dampak :**  
- Di production build, `unifiedSalesLog.json` adalah static bundle — tidak bisa ditulis
- Data sales hanya tersedia saat dev server aktif; production tidak memiliki persistence

---

## 🔴 Bug Kritis — FORECAST

### BUG-FC-01 · Forecast Tidak Terhubung ke Supabase Sama Sekali

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/DemandForecastingPage.jsx` baris 199–232 · `frontend/vite.config.js` baris 418–532 |
| **Severity** | 🔴 CRITICAL |
| **Kategori** | Architecture / Missing Integration |

**Deskripsi:**  
Halaman Demand Forecasting membaca data ML dari `/api/forecast/products`, yang di Vite server membaca file `three_day_forecast.json` lokal. **Tidak ada satu pun query ke Supabase** untuk data forecast:

```javascript
// vite.config.js baris 424–425
const forecasts = readJson(FORECAST_JSON)   // ← baca lokal, bukan Supabase
const batches   = readJson(MASTER_JSON).filter(r => Number(r.quantity) > 0)
```

Padahal Supabase sudah memiliki kolom `demand_forecast_3d` di tabel `batches` dan `waste_risk_score`. Data ini tidak pernah dibaca oleh halaman Forecast.

**Dampak :**  
- Forecast yang ditampilkan berasal dari JSON file statis, bukan data live Supabase
- Jika `three_day_forecast.json` tidak ada, halaman menampilkan data heuristik fallback tanpa notifikasi
- Kolom `demand_forecast_3d` di Supabase tidak pernah digunakan oleh frontend

---

### BUG-FC-02 · Action CTA "Execute" Tidak Melakukan Apapun ke Database

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/DemandForecastingPage.jsx` baris 309–323 |
| **Severity** | 🔴 CRITICAL |
| **Kategori** | Business Logic / Dead Code |

**Deskripsi:**  
Tombol aksi utama di Forecast ("Create PO", "Activate 30% Markdown", "Schedule Dispatch") hanya menampilkan toast notification, tanpa melakukan **apapun** ke database:

```javascript
// DemandForecastingPage.jsx baris 309–323
const handleExecute = () => {
  setIsExecuting(true)
  setTimeout(() => {
    setIsExecuting(false)
    if (decision.actionType === 'reorder') {
      showToast(`📦 Restock PO created for +${decision.deficit} ${unit}...`)
      // ↑ TIDAK ada fetch, tidak ada state update, tidak ada Supabase call!
    } else if (decision.actionType === 'markdown') {
      showToast(`🏷️ 30% discount applied to ${selectedProduct} in POS.`)
      // ↑ Markdown TIDAK di-apply ke batch di inventory!
    } else if (decision.actionType === 'donate') {
      showToast(`🚚 Food Bank dispatch booked for...`)
      // ↑ Dispatch TIDAK tercatat di dispatch_log Supabase!
    }
  }, 400)
}
```

Semua action dari halaman Forecast adalah **UI-only / dead code** — tidak ada efek nyata ke inventory, Supabase, atau dispatch log.

**Dampak :**  
- User mengira PO sudah dibuat, padahal tidak
- User mengira markdown sudah diapply ke POS, padahal batch masih harga penuh
- Potensi misleading untuk tim operasional

---

### BUG-FC-03 · `selectedProduct` Tidak Reset Saat Batch Dihapus

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/DemandForecastingPage.jsx` baris 267 |
| **Severity** | 🟠 MEDIUM |
| **Kategori** | State Management |

**Deskripsi:**  
`selectedProduct` diinisialisasi dengan `allProducts[0]` pada render pertama:

```javascript
const [selectedProduct, setSelectedProduct] = useState(allProducts[0] || 'Bell Pepper')
```

Jika user menghapus batch yang sedang ditampilkan di forecast, `allProducts` berubah tapi `selectedProduct` **tidak di-reset**. Halaman mencoba merender `mergedDb[selectedProduct]` yang sudah tidak ada, lalu fallback ke:

```javascript
const productData = mergedDb[selectedProduct] || mergedDb[allProducts[0]] || defaultForecastData['Bell Pepper']
```

User tidak mendapat notifikasi bahwa produk yang dipilih sudah dihapus, dan UI diam-diam beralih ke produk lain.

---

### BUG-FC-04 · Forecast Heuristik Menggunakan Rasio Tetap (35/30/25%)

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/DemandForecastingPage.jsx` baris 26–28 |
| **Severity** | 🟠 MEDIUM |
| **Kategori** | Business Logic |

**Deskripsi:**  
Ketika ML forecast tidak tersedia dan produk tidak ada di ML output, sistem menggunakan fallback heuristik:

```javascript
const d1 = Math.max(1, Math.round(stock * 0.35))  // hari 1
const d2 = Math.max(1, Math.round(stock * 0.30))  // hari 2
const d3 = Math.max(1, Math.round(stock * 0.25))  // hari 3
```

**90% dari stok dianggap terjual dalam 3 hari**, tanpa mempertimbangkan kategori produk, turnover ratio aktual, atau historical sales. Produk slow-moving seperti Olive Oil atau Spices akan mendapat prediksi demand jauh terlalu tinggi, menghasilkan keputusan "restock" yang tidak perlu.

---

## 🟠 Bug Medium — SUPABASE STORAGE

### BUG-STOR-01 · Tidak Ada Bucket Storage untuk Gambar Produk

| | |
|---|---|
| **File** | Seluruh codebase |
| **Severity** | 🟠 MEDIUM |
| **Kategori** | Missing Feature |

**Deskripsi:**  
Tidak ada satupun penggunaan `supabase.storage` di seluruh codebase. Semua gambar produk menggunakan:

1. **Static local assets** di `/public/image/`
2. **Hardcoded Unsplash URL** sebagai fallback:

```javascript
// DashboardPage.jsx baris 224
image: batch.image || 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?...'

// SalesLogPage.jsx baris 304
image: selectedBatch.image || 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?...'
```

Schema database (tabel `batches`) tidak memiliki kolom `image_url` atau `storage_path` untuk menyimpan referensi gambar dari Supabase Storage.

**Dampak :**  
- Tidak bisa upload gambar produk dari UI
- Semua produk menampilkan gambar generik yang sama (single Unsplash URL)
- Jika Unsplash URL berubah/mati, semua product image hilang

---

### BUG-STOR-02 · Tidak Ada Bucket untuk Dispatch Proof of Delivery

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/DispatchPage.jsx` · `database/schema.sql` |
| **Severity** | 🟠 MEDIUM |
| **Kategori** | Missing Feature / Audit Gap |

**Deskripsi:**  
Halaman Dispatch mengelola pengiriman batch ke food bank dengan sistem undo 10 detik, tapi **tidak ada mekanisme upload bukti pengiriman** (delivery receipt, foto penerimaan). Tabel `dispatch_log` di schema tidak memiliki kolom untuk file attachment:

```sql
-- schema.sql — dispatch_log tidak memiliki kolom:
-- receipt_url, delivery_photo_url, proof_storage_path
```

**Dampak :**  
- Tidak ada audit trail visual untuk food bank dispatch
- Tidak bisa verifikasi apakah makanan benar-benar sampai ke food bank
- Compliance dan reporting untuk CSR tidak bisa dilakukan

---

### BUG-STOR-03 · `migration_metadata` untuk Storage Policies Tidak Ada

| | |
|---|---|
| **File** | `database/schema.sql` |
| **Severity** | 🟠 MEDIUM |
| **Kategori** | Missing Configuration |

**Deskripsi:**  
`schema.sql` mendefinisikan RLS policies untuk tabel database, tapi **tidak ada setup Storage bucket policies**. Supabase Storage memerlukan:

```sql
-- TIDAK ADA di schema.sql:
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);
CREATE POLICY "Public read product images"
  ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "Auth upload product images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');
```

Tanpa ini, bucket Storage tidak bisa dibuat via migration, harus dibuat manual di Supabase Dashboard.

---

## 🟠 Bug Medium — DATABASE & SYNC

### BUG-DB-01 · `simulation_events` FK Tidak Pernah Ditest

| | |
|---|---|
| **File** | `database/schema.sql` baris 90–102 · `frontend/vite.config.js` baris 331–355 |
| **Severity** | 🟠 MEDIUM |
| **Kategori** | Data Integrity |

**Deskripsi:**  
Tabel `simulation_events` memiliki FK constraint ke `batches(batch_id)` yang `DEFERRABLE INITIALLY DEFERRED`. Ketika sale event dikirim ke Supabase, `batch_id` diisi dari `txn.batchId`:

```javascript
// vite.config.js baris 341
batch_id: txn.batchId || 'UNKNOWN',
```

Jika `txn.batchId` tidak ada atau bernilai `'UNKNOWN'`, FK constraint akan violated karena tidak ada batch dengan ID tersebut. `'UNKNOWN'` jelas tidak ada di tabel `batches`.

**Dampak :**  
- Insert ke `simulation_events` gagal dengan FK violation
- Jika `DEFERRABLE` bekerja, error baru muncul saat commit — sulit di-debug

---

### BUG-DB-02 · `v_dashboard_summary` View Tidak Pernah Dikonsumsi Frontend

| | |
|---|---|
| **File** | `database/schema.sql` baris 200–229 · `backend/services/dashboard_service.py` baris 1–11 |
| **Severity** | 🟠 MEDIUM |
| **Kategori** | Architecture |

**Deskripsi:**  
Schema mendefinisikan view `v_dashboard_summary` yang mengagregasi KPI dari tabel `batches`. Namun `dashboard_service.py` **sama sekali tidak membaca dari Supabase** — ia mengembalikan data mock hardcode:

```python
# dashboard_service.py baris 1–11
def get_dashboard_summary():
    return {
        "status": "success",
        "is_mock_data": True,       # ← mock data!
        "total_batches": 3,         # ← hardcode!
        "total_food_items": 105,    # ← hardcode!
        "total_food_rescued": 75.0, # ← hardcode!
        "total_food_wasted": 12.0,  # ← hardcode!
        "forecast_status": "Available"
    }
```

View Supabase `v_dashboard_summary` sudah disiapkan tapi tidak pernah dipakai.

---

### BUG-DB-03 · Vite Config Mengekspos Service Role Key ke Client Bundle

| | |
|---|---|
| **File** | `frontend/vite.config.js` baris 136–137 |
| **Severity** | 🔴 CRITICAL |
| **Kategori** | Security |

**Deskripsi:**  
`vite.config.js` adalah file konfigurasi build yang berjalan di Node.js (server-side), bukan browser. Namun ia membaca `SUPABASE_SERVICE_ROLE_KEY`:

```javascript
// vite.config.js baris 136–137
const SUPABASE_URL = getEnvKey('VITE_SUPABASE_URL') || '...'
const SUPABASE_KEY = getEnvKey('SUPABASE_SERVICE_ROLE_KEY')
```

Variabel `SUPABASE_KEY` digunakan hanya di `syncToSupabase()` yang berjalan di Vite middleware (server-side). **Ini aman selama hanya di dev server.** Namun jika developer secara tidak sengaja menggunakan `SUPABASE_KEY` di dalam code yang di-bundle (misalnya import dari vite.config), key akan ter-expose ke browser.

Risiko tambahan: `VITE_SUPABASE_URL` di-fallback ke URL hardcode (baris 136), yang **memaksa koneksi ke project Supabase production** meski `.env` tidak ada.

---

## 🟡 Bug Minor — UI/UX

### BUG-UI-01 · Toast di SalesLogPage Tidak Memiliki Undo untuk Delete

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/SalesLogPage.jsx` baris 253–261 |
| **Severity** | 🟡 LOW |
| **Kategori** | UX |

**Deskripsi:**  
`handleDeleteSale()` langsung menghapus transaksi dari state dan server tanpa konfirmasi atau undo window, sedangkan `InventoryFefoRiskPage` sudah memiliki undo toast selama 4.8 detik. Inkonsistensi UX antar halaman.

---

### BUG-UI-02 · Forecast Tidak Menampilkan Source Data (ML vs Heuristik)

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/DemandForecastingPage.jsx` baris 199–232 |
| **Severity** | 🟡 LOW |
| **Kategori** | UX / Transparency |

**Deskripsi:**  
Ketika ML forecast gagal dan sistem fallback ke heuristik, `mlError` di-set tapi **tidak ditampilkan ke user** di UI. User tidak tahu apakah angka yang ditampilkan berasal dari LightGBM model atau dari estimasi sederhana `stock * 35%`.

---

### BUG-UI-03 · `inventoryData.js` Hard-code 1354 Baris Data Static

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/inventoryData.js` |
| **Severity** | 🟡 LOW |
| **Kategori** | Performance / Architecture |

**Deskripsi:**  
File `inventoryData.js` berisi `INITIAL_BATCHES` dengan **40+ batch** yang di-hardcode sebagai JavaScript object. File ini berukuran 1354 baris. Ini di-bundle ke dalam production JavaScript bundle, menambah ukuran bundle unnecessarily. Data seharusnya di-fetch dari Supabase atau JSON file terpisah.

---

### BUG-UI-04 · `maxQty` di POS Modal Tidak Update Real-time Setelah Sale

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/SalesLogPage.jsx` baris 192–194 |
| **Severity** | 🟡 LOW |
| **Kategori** | State Management |

**Deskripsi:**  
```javascript
// SalesLogPage.jsx baris 192–194
const maxQty = selectedBatch
  ? (selectedBatch.stockQty !== undefined ? Number(selectedBatch.stockQty) : parseNum(selectedBatch.qty))
  : 10
```

`maxQty` tergantung pada `selectedBatch` dari `activeBatches`, yang tergantung pada `batches` prop dari parent. Setelah sale direcord, `onUpdateBatches` diupdate via callback, tapi jika POS modal **masih terbuka**, `maxQty` tidak langsung terupdate sampai modal ditutup dan dibuka lagi. User bisa input qty melebihi stok yang tersedia jika mereka record 2 sale berturut-turut dari modal yang sama.

---

### BUG-UI-05 · Warning React — Key Duplikat di Sales Table

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/SalesLogPage.jsx` baris 663 |
| **Severity** | 🟡 LOW |
| **Kategori** | React Warning |

**Deskripsi:**  
```javascript
// SalesLogPage.jsx baris 663–664
{filteredSales.map((s, idx) => (
  <tr key={`${s.id}-${idx}`}>
```

Key menggunakan kombinasi `s.id + idx`. Jika ada dua transaksi dengan ID yang sama (duplikat dari data seed), key menjadi duplikat setelah idx berubah akibat filter. Seharusnya menggunakan hanya `s.id` sebagai key.

---

## 🔴 Bug Kritis — RULE ENGINE

### BUG-RE-01 · `discount_percent` Naming Inconsistency — Python vs JavaScript

| | |
|---|---|
| **File** | `src/engine/rule_engine.py` · `frontend/vite.config.js` baris ~310 |
| **Severity** | 🔴 CRITICAL |
| **Kategori** | API Contract / Schema Mismatch |

**Deskripsi:**  
`rule_engine.py` Python mengembalikan key `discount_percent` dengan nilai **fraction** (0.0–1.0):

```python
# rule_engine.py — assign_route() return
return {
    "recommended_route": "Dynamic Markdown",
    "discount_percent": 0.25,   # <-- ini adalah fraction, bukan percent!
    ...
}
```

Sedangkan port JavaScript di `vite.config.js` mengembalikan key yang sama dengan nilai **persen aktual** (0–100) DAN menambahkan key `discount_fraction` secara terpisah:

```javascript
// vite.config.js — applyRuleEngine()
discount_percent: Math.round(discountPct * 100),   // 25 (actual percent)
discount_fraction: discountPct,                      // 0.25 (fraction)
```

Frontend mengakses `ruleDecision?.discount_fraction` — ini bekerja via Vite middleware, tapi **jika frontend memanggil FastAPI backend langsung** (`/api/recommend`), Python hanya mengembalikan `discount_percent: 0.25` (fraction) tanpa `discount_fraction`. Harga diskon yang dihitung frontend akan salah (25× lipat lebih kecil).

**Dampak:**  
- Harga setelah diskon tampil salah ketika backend FastAPI digunakan langsung
- `discounted_price_myr` yang disimpan ke Supabase bisa jadi RM 0.03 bukannya RM 3.00

---

### BUG-RE-02 · `evaluate_lot_dataframe()` — Urutan Proses Non-Deterministik

| | |
|---|---|
| **File** | `src/engine/rule_engine.py` baris ~180–210 |
| **Severity** | 🔴 CRITICAL |
| **Kategori** | Business Logic / Non-Determinism |

**Deskripsi:**  
`evaluate_lot_dataframe()` memproses rows dalam urutan iterasi DataFrame (urutan file CSV), bukan diurutkan berdasarkan DTE atau prioritas:

```python
# rule_engine.py — tidak ada sort sebelum iterasi
for idx, row in df.iterrows():
    result = assign_route(row.to_dict(), cumulative_donated)
    cumulative_donated += result.get("donated_qty", 0)
```

`cumulative_donated` adalah quota tracker untuk limit donasi. Karena urutan tidak di-sort by DTE, lot mana yang mendapat alokasi donasi bergantung pada **urutan baris CSV**, bukan pada urgensi kedaluwarsa. Lot yang lebih kritis (DTE lebih kecil) bisa kehilangan slot donasi karena lot lain yang DTE-nya lebih besar diproses duluan.

**Dampak:**  
- Alokasi donasi non-deterministik — hasil berbeda setiap kali CSV di-reorder
- Lot paling kritis mungkin di-route ke "Markdown" alih-alih "Donation" karena quota sudah penuh

---

## 🟠 Bug Medium — DISPATCH PAGE

### BUG-DSP-01 · Receiver Assignment via Modulo Index — Tidak Ada Kapasitas/Kategori Matching

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/DispatchPage.jsx` baris 180 |
| **Severity** | 🟠 MEDIUM |
| **Kategori** | Business Logic |

**Deskripsi:**  
Receiver food bank di-assign ke batch menggunakan **modulo dari array index**:

```javascript
// DispatchPage.jsx baris 180
const assignedReceiver = DEFAULT_RECEIVERS[idx % DEFAULT_RECEIVERS.length]
```

Ini berarti batch ke-0 selalu ke Kechara Soup Kitchen, batch ke-1 ke TLFP, dst. Tidak ada logic yang mempertimbangkan:
- `capacityKg` vs `availableKg` — receiver yang sudah penuh tetap dapat assignment
- `accepted` food categories — receiver yang hanya terima "Bakery" bisa dapat "Seafood"
- Jarak terdekat (nilai `distanceKm` juga dihitung formula sederhana `4.5 + idx * 1.8`, bukan OSRM nyata)

**Dampak:**  
- Dispatch ke receiver yang kapasitasnya sudah penuh
- Makanan laut dikirim ke tempat yang hanya terima roti
- UI menampilkan "OSRM" tapi perhitungan jarak adalah formula linear palsu

---

### BUG-DSP-02 · Dispatch State Hanya In-Memory — Tidak Disimpan ke Supabase

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/DispatchPage.jsx` baris 120, ~400 |
| **Severity** | 🟠 MEDIUM |
| **Kategori** | Data Persistence |

**Deskripsi:**  
State dispatch (`dispatchedBatchIds`, `pendingDispatch`) hanya disimpan di React state:

```javascript
const [dispatchedBatchIds, setDispatchedBatchIds] = useState(new Set())
const [pendingDispatch, setPendingDispatch] = useState({})
```

Ketika user me-dispatch batch:
1. `handleDispatchBatch()` memanggil `onApplyAction` (parent state update)
2. Tidak ada API call ke backend atau Supabase
3. Tidak ada update ke `simulation_events` atau `batches` table di Supabase

Refresh halaman = semua dispatch history hilang. Receiver food bank tidak mendapat notifikasi apapun.

**Dampak:**  
- Dispatch history tidak persisten — laporan food rescue tidak akurat
- Status batch di Supabase tetap `active_fefo` meski sudah dispatched

---

### BUG-DSP-03 · `wasteScore` Dihitung dengan Formula Hardcode — Mengabaikan ML Model Output

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/DispatchPage.jsx` baris 147–177 |
| **Severity** | 🟠 MEDIUM |
| **Kategori** | Architecture / ML Integration |

**Deskripsi:**  
Dispatch page menghitung `wasteScore` sendiri dengan formula sederhana berbasis DTE:

```javascript
// DispatchPage.jsx baris 153–177
if (dteNum <= 1) {
  wasteScore = Math.min(96, 88 + (idx % 7))   // hardcoded formula
} else if (dteNum <= 2) {
  wasteScore = Math.min(84, 78 + (idx % 5))
} else if (dteNum <= 4) {
  wasteScore = Math.min(72, 58 + (idx % 10))
} else {
  wasteScore = Math.max(18, 25 - (dteNum * 2))
}
```

Padahal `src/ml/spoilage.py` sudah ada model ML `spoilage_classifier.pkl` yang mempertimbangkan `turnover_ratio`, `stock_pressure`, `sales_rate`, dan kategori produk. Output ML dari `batch.risk_label` yang ada di data batch **tidak digunakan sama sekali** di Dispatch Page.

**Dampak:**  
- Waste score yang ditampilkan tidak akurat (formula linear sederhana vs ML prediction)
- `idx % 7` membuat score berbeda untuk produk yang sama tergantung posisi di array

---

### BUG-DSP-04 · Undo Dispatch: `clearInterval` Tidak Dipanggil Saat Unmount

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/DispatchPage.jsx` baris ~138, ~350 |
| **Severity** | 🟠 MEDIUM |
| **Kategori** | Memory Leak |

**Deskripsi:**  
Sistem undo dispatch menggunakan `setInterval` untuk countdown yang disimpan di `countdownRefs`:

```javascript
const countdownRefs = useRef({})  // { [batchId]: intervalId }
```

Ketika komponen di-unmount (user navigasi ke halaman lain), interval yang masih berjalan tidak di-clear. Tidak ada `useEffect` cleanup yang memanggil:

```javascript
// TIDAK ADA cleanup seperti ini:
return () => Object.values(countdownRefs.current).forEach(clearInterval)
```

**Dampak:**  
- Memory leak: interval tetap berjalan meski komponen sudah unmount
- Potensi setState call pada unmounted component (React warning / crash)

---

## 🟠 Bug Medium — ML / SPOILAGE MODEL

### BUG-ML-01 · `spoilage.py` Menjalankan Demo Code di Module Level

| | |
|---|---|
| **File** | `src/ml/spoilage.py` baris 104–115 |
| **Severity** | 🟠 MEDIUM |
| **Kategori** | Side Effect / Module Design |

**Deskripsi:**  
File `spoilage.py` memiliki kode demo yang **dieksekusi saat module di-import**:

```python
# spoilage.py baris 104–115 — ini berjalan saat `import spoilage`
sample_lot = {
    'turnover_ratio': 3.5,
    'stock_pressure': 0.8,
    'unit_price': 12.0,
    'sales_rate': 0.15,
    'category': 'Fruits & Vegetables',
    'shelf_life_days': 5
}

result = predict_spoilage_risk(sample_lot)
print(f"✅ Pengujian independen model: {result}")
```

Setiap kali modul ini di-import oleh `rule_engine.py` atau backend, kode ini akan:
1. Memanggil `_load_model_package()` — membaca file `.pkl` dari disk
2. Mencetak output ke stdout — mencemari log server
3. Jika model tidak ada, akan fallback dan tetap print

**Dampak:**  
- Server log penuh dengan output debug yang tidak diinginkan
- Memperlambat startup server karena disk I/O saat import
- Tidak professional untuk production deployment

---

### BUG-ML-02 · `_MODEL_PACKAGE` Global Cache Tidak Thread-Safe

| | |
|---|---|
| **File** | `src/ml/spoilage.py` baris 21–39 |
| **Severity** | 🟠 MEDIUM |
| **Kategori** | Concurrency / Race Condition |

**Deskripsi:**  
Model di-cache menggunakan global variable tanpa lock:

```python
_MODEL_PACKAGE = None  # global cache

def _load_model_package(model_path: str = DEFAULT_MODEL_PATH) -> dict | None:
    global _MODEL_PACKAGE
    if _MODEL_PACKAGE is not None:
        return _MODEL_PACKAGE   # <-- race condition window
    # ... load from disk
    _MODEL_PACKAGE = loaded     # <-- multiple threads bisa masuk sini bersamaan
```

Dalam FastAPI dengan `uvicorn` multi-worker atau async context, dua request yang masuk bersamaan bisa sama-sama menemukan `_MODEL_PACKAGE is None`, lalu keduanya load dari disk, dan race condition di assignment.

**Dampak:**  
- Potensi model di-load dua kali secara bersamaan
- Pada high-load, bisa terjadi inconsistent state

---

### BUG-ML-03 · `Batch` Schema Pydantic Tidak Mencakup Field Rule Engine

| | |
|---|---|
| **File** | `backend/schemas/batch.py` baris 1–17 |
| **Severity** | 🟠 MEDIUM |
| **Kategori** | Schema Mismatch / API Contract |

**Deskripsi:**  
`BatchResponse` schema hanya mendefinisikan 5 field:

```python
class Batch(BaseModel):
    batch_id: str
    food_name: str
    quantity: float
    unit: str
    status: str
```

Tapi Supabase `batches` table memiliki 20+ kolom termasuk `recommended_route`, `discount_percent`, `moral_hazard_flag`, `channel`, `risk_label`, dll. Response dari `GET /api/batches` di FastAPI akan **memotong semua field penting** ini — frontend tidak bisa mendapatkan rule engine output atau ML label dari FastAPI endpoint.

**Dampak:**  
- Ketika menggunakan FastAPI endpoint (bukan Vite middleware), response kehilangan data kritis
- Frontend tidak bisa menampilkan rekomendasi route dan diskon dari FastAPI

---

## 🟡 Bug Minor — ACTIVITIES & CHARTS

### BUG-ACT-01 · CSV Export Memory Leak — `URL.revokeObjectURL()` Tidak Dipanggil

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/RecentActivitiesTable.jsx` baris 52–74 |
| **Severity** | 🟡 LOW |
| **Kategori** | Memory Leak |

**Deskripsi:**  
Fungsi `handleExportCSV()` membuat Blob URL untuk download tapi tidak pernah merevoke-nya:

```javascript
// RecentActivitiesTable.jsx baris 52–74
const blob = new Blob([csvContent], { type: 'text/csv' })
const url = URL.createObjectURL(blob)   // <-- URL dibuat
const link = document.createElement('a')
link.href = url
link.download = 'activities_export.csv'
document.body.appendChild(link)
link.click()
document.body.removeChild(link)
// URL.revokeObjectURL(url) TIDAK DIPANGGIL <-- memory leak
```

Setiap kali user klik export, satu Blob URL tetap hidup di memory sampai halaman di-refresh.

**Dampak:**  
- Memory usage bertambah setiap kali export dilakukan
- Pada session panjang dengan banyak export, bisa menyebabkan memory pressure

---

### BUG-ACT-02 · Activities State Hanya In-Memory — Tidak Disimpan ke Supabase

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/RecentActivitiesTable.jsx` · `frontend/src/components/dashboard/activitiesData.js` |
| **Severity** | 🟡 LOW |
| **Kategori** | Data Persistence |

**Deskripsi:**  
`INITIAL_ACTIVITIES` di `activitiesData.js` adalah array statis hardcode dengan 8 aktivitas:

```javascript
// activitiesData.js — data statis, tidak pernah diupdate
export const INITIAL_ACTIVITIES = [
  { "time": "11:05 PM", "batch": "LOT-1000", ... },
  { "time": "10:40 PM", "batch": "LOT-1010", ... },
  // ... 8 items hardcode
]
```

Komentar di baris 1 menyatakan _"Connected directly to inventory_master.csv"_ — tapi tidak ada koneksi apapun. Tidak ada endpoint `/api/activities`, tidak ada Supabase query, tidak ada file read. Aktivitas yang terlihat di dashboard **tidak pernah berubah** meski user melakukan sales/dispatch nyata.

**Dampak:**  
- Recent Activities Table selalu menampilkan 8 data dummy yang sama
- Aktivitas nyata (sales, dispatch) tidak muncul di feed aktivitas

---

### BUG-ACT-03 · Risk Filter Tab: Case-Sensitive Mismatch

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/RecentActivitiesTable.jsx` baris ~85 |
| **Severity** | 🟡 LOW |
| **Kategori** | Logic / UI |

**Deskripsi:**  
Filter tab "high-risk" membandingkan `row.riskTier` secara langsung:

```javascript
// RecentActivitiesTable.jsx — filter tab count
count = rows.filter(r => r.riskTier === 'High' || r.riskTier === 'Expiring').length
```

Tapi fungsi `normRisk()` yang dipakai untuk render badge mengubah `'Expiring'` → `'high'` (lowercase). Jika ada data dengan `riskTier: 'expiring'` (lowercase), tab count tidak akan menghitungnya meski badge akan tampil sebagai high-risk.

**Dampak:**  
- Jumlah di tab filter bisa berbeda dari jumlah item yang terlihat
- Inkonsistensi antara filter logic dan display logic

---

### BUG-CHART-01 · `FoodRescuedTrendChart` / `ProfitDailyChart` — Data 100% Hardcode

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/FoodRescuedTrendChart.jsx` baris 9–17 |
| **Severity** | 🟡 LOW |
| **Kategori** | Data / Mock |

**Deskripsi:**  
Chart "Daily Net Profit" menggunakan data hardcode dengan tanggal spesifik (Oct 28 – Nov 03) yang tidak pernah update:

```javascript
// FoodRescuedTrendChart.jsx baris 9–17
const data = [
  { day: 'Fri', date: 'Oct 28', value: 312, rate: '+8%'  },
  { day: 'Sat', date: 'Oct 29', value: 480, rate: '+12%' },
  { day: 'Sun', date: 'Oct 30', value: 390, rate: '+5%'  },
  { day: 'Mon', date: 'Oct 31', value: 620, rate: '+18%' },
  { day: 'Tue', date: 'Nov 01', value: 540, rate: '+10%' },
  { day: 'Wed', date: 'Nov 02', value: 780, rate: '+25%' },
  { day: 'Thu', date: 'Nov 03', value: 950, rate: '+30%' }
]
```

Data ini tidak terhubung ke `transactions.json`, Supabase, atau apapun. Profit aktual dari Sales Log POS tidak diperhitungkan. Chart ini sudah "basi" sejak hari pertama deployment.

**Dampak:**  
- Dashboard menampilkan profit palsu — misleading untuk decision making
- "Last 7 Days" selalu menunjuk ke minggu yang sama (Oct 28 – Nov 03)

---

### BUG-CHART-02 · `ReasonForRecoveryChart` — Bobot Hardcode, Total Mismatch

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/ReasonForRecoveryChart.jsx` baris 9–24 |
| **Severity** | 🟡 LOW |
| **Kategori** | Data / Mock |

**Deskripsi:**  
Donut chart "Channel Action Breakdown" hardcode nilai:

```javascript
const items = [
  { label: 'Sales',     percent: 65, weight: '806 kg'  },
  { label: 'Food Bank', percent: 35, weight: '434 kg'  }
]
// Center label animates ke 1,240 kg (806 + 434 = 1240 ✓)
```

Angka 1,240 kg juga muncul hardcode di `DashboardSidebar.jsx` baris 237:
```jsx
<p>AI telemetry active. 1,240 kg rescued this week.</p>
```

Semua angka ini statis — tidak dihitung dari data dispatch atau sales aktual. Sidebar juga menyebut nama user "Raoul" yang hardcode (baris 235: `<div>Hi Raoul</div>`) tanpa auth session.

**Dampak:**  
- Metrik food rescue yang ditampilkan bukan data nyata
- Sidebar menyapa semua user sebagai "Raoul" — tidak ada personalisasi berbasis auth

---

### BUG-KPI-01 · `KpiStrip` — `activeBatchesCount` Default Hardcode `5`

| | |
|---|---|
| **File** | `frontend/src/components/dashboard/KpiStrip.jsx` baris 53 |
| **Severity** | 🟡 LOW |
| **Kategori** | Default Value / UX |

**Deskripsi:**  
`KpiStrip` komponen memiliki default prop `activeBatchesCount = 5`:

```javascript
// KpiStrip.jsx baris 50–54
export default function KpiStrip({
  totalAssets = 0,
  profit = 0,
  activeBatchesCount = 5,   // <-- hardcode default
  onNavigateInventory
})
```

Jika parent (`DashboardPage`) gagal mengambil data inventory (network error, Supabase down, dll), KPI strip akan menampilkan "5 Lots" meski tidak ada data. Seharusnya default `0` atau `null` dengan state loading.

Selain itu, label "100% Monitored" di baris 128 adalah hardcode — tidak dihitung dari jumlah batch yang benar-benar memiliki monitoring data.

**Dampak:**  
- User melihat "5 Lots · 100% Monitored" meski data belum dimuat / error
- Misleading KPI pada kondisi loading/error

---

> ⚠️ **Status: BELUM DIPERBAIKI** — Dokumen ini hanya untuk audit dan referensi tim developer.

---

## Tabel Rekapitulasi

| ID | Fitur | Severity | Kategori | Dampak |
|----|-------|----------|----------|--------|
| BUG-INV-01 | Inventory | 🔴 CRITICAL | Data Integrity | Stok tidak ter-update setelah action dari data Supabase |
| BUG-INV-02 | Inventory | 🔴 CRITICAL | Data Sync | Batch baru tidak sync benar ke Supabase |
| BUG-INV-03 | Inventory | 🔴 CRITICAL | Security/RLS | Delete bypass RLS, tidak ada audit trail |
| BUG-INV-04 | Inventory | 🔴 CRITICAL | Logic/Time-bomb | DTE salah hitung — tanggal referensi hardcode |
| BUG-INV-05 | Inventory | 🔴 CRITICAL | Data Sync | Edit batch tidak sync field selain qty ke Supabase |
| BUG-SALES-01 | Sales Log | 🔴 CRITICAL | Schema Mismatch | `event_type: 'sale'` tidak valid di Supabase enum |
| BUG-SALES-02 | Sales Log | 🔴 CRITICAL | Business Logic | Cashier hardcode `'John Doe'` |
| BUG-SALES-03 | Sales Log | 🔴 CRITICAL | File System | `transactions.json` tidak pernah dibuat di fresh install |
| BUG-SALES-04 | Sales Log | 🔴 CRITICAL | Data Integrity | Edit qty transaksi tidak update inventory stok |
| BUG-FC-01 | Forecast | 🔴 CRITICAL | Architecture | Forecast tidak terhubung ke Supabase sama sekali |
| BUG-FC-02 | Forecast | 🔴 CRITICAL | Dead Code | Action CTA tidak melakukan apapun ke database |
| BUG-RE-01 | Rule Engine | 🔴 CRITICAL | API Contract | `discount_percent` fraction vs persen — Python vs JS berbeda |
| BUG-RE-02 | Rule Engine | 🔴 CRITICAL | Business Logic | `evaluate_lot_dataframe()` urutan non-deterministik |
| BUG-DB-03 | Security | 🔴 CRITICAL | Security | Service Role Key berpotensi masuk bundle |
| BUG-SALES-05 | Sales Log | 🟠 MEDIUM | Data Consistency | Duplikasi write ke `unifiedSalesLog.json` |
| BUG-FC-03 | Forecast | 🟠 MEDIUM | State Management | `selectedProduct` tidak reset saat batch dihapus |
| BUG-FC-04 | Forecast | 🟠 MEDIUM | Business Logic | Heuristik 35/30/25% tidak mempertimbangkan kategori |
| BUG-FC-05 | Forecast | 🟠 MEDIUM | Performance | O(N) disk reads di `get_all_products_forecast()` |
| BUG-FC-06 | Forecast | 🟠 MEDIUM | Timezone | `datetime.now()` tanpa timezone — tanggal off by 1 hari |
| BUG-FC-07 | Forecast | 🟠 MEDIUM | Stale Data | `load_lots()` baca CSV tapi sistem tulis ke JSON |
| BUG-STOR-01 | Storage | 🟠 MEDIUM | Missing Feature | Tidak ada Supabase Storage bucket untuk gambar |
| BUG-STOR-02 | Storage | 🟠 MEDIUM | Missing Feature | Tidak ada storage untuk dispatch proof of delivery |
| BUG-STOR-03 | Storage | 🟠 MEDIUM | Missing Config | Storage bucket policies tidak ada di schema.sql |
| BUG-DB-01 | Database | 🟠 MEDIUM | Data Integrity | FK violation: `batch_id: 'UNKNOWN'` di simulation_events |
| BUG-DB-02 | Database | 🟠 MEDIUM | Architecture | `v_dashboard_summary` view tidak pernah digunakan |
| BUG-DSP-01 | Dispatch | 🟠 MEDIUM | Business Logic | Receiver assignment via modulo index — abaikan kapasitas |
| BUG-DSP-02 | Dispatch | 🟠 MEDIUM | Data Persistence | Dispatch state hanya in-memory, tidak disimpan ke Supabase |
| BUG-DSP-03 | Dispatch | 🟠 MEDIUM | ML Integration | `wasteScore` formula hardcode, abaikan ML output |
| BUG-DSP-04 | Dispatch | 🟠 MEDIUM | Memory Leak | `setInterval` undo countdown tidak di-clear saat unmount |
| BUG-ML-01 | ML Model | 🟠 MEDIUM | Side Effect | `spoilage.py` menjalankan demo code saat module di-import |
| BUG-ML-02 | ML Model | 🟠 MEDIUM | Concurrency | `_MODEL_PACKAGE` global cache tidak thread-safe |
| BUG-ML-03 | ML Model | 🟠 MEDIUM | Schema Mismatch | `Batch` Pydantic schema hanya 5 field, abaikan 20+ kolom |
| BUG-UI-01 | UI/UX | 🟡 LOW | UX | Delete sale tidak ada undo |
| BUG-UI-02 | UI/UX | 🟡 LOW | Transparency | Fallback ke heuristik tidak diinformasikan ke user |
| BUG-UI-03 | UI/UX | 🟡 LOW | Performance | 1354 baris data static ter-bundle ke JS |
| BUG-UI-04 | UI/UX | 🟡 LOW | State Management | `maxQty` POS tidak real-time update |
| BUG-UI-05 | UI/UX | 🟡 LOW | React Warning | Potensi duplicate key di sales table |
| BUG-ACT-01 | Activities | 🟡 LOW | Memory Leak | `URL.createObjectURL()` tanpa `revokeObjectURL()` |
| BUG-ACT-02 | Activities | 🟡 LOW | Data Persistence | Activities state in-memory, tidak sync ke Supabase |
| BUG-ACT-03 | Activities | 🟡 LOW | Logic | Risk filter tab case-sensitive mismatch vs normRisk() |
| BUG-CHART-01 | Charts | 🟡 LOW | Mock Data | `ProfitDailyChart` data hardcode Oct 28–Nov 03 |
| BUG-CHART-02 | Charts | 🟡 LOW | Mock Data | `ReasonForRecoveryChart` hardcode, sidebar "Hi Raoul" |
| BUG-KPI-01 | KPI | 🟡 LOW | Default Value | `activeBatchesCount` default `5`, "100% Monitored" hardcode |

### Distribusi per Severity

| Severity | Jumlah |
|----------|--------|
| 🔴 CRITICAL | 14 |
| 🟠 MEDIUM | 19 |
| 🟡 LOW | 10 |
| **Total** | **43** |

### Distribusi per Fitur

| Fitur | Jumlah Bug |
|-------|-----------|
| Inventory | 5 |
| Sales Log | 5 |
| Forecast | 7 |
| Rule Engine | 2 |
| Dispatch | 4 |
| ML Model | 3 |
| Supabase Storage | 3 |
| Database / Security | 3 |
| UI/UX | 5 |
| Activities & Charts | 4 |
| KPI Strip | 1 |
| **Total** | **43** |

---

> ⚠️ **Status: BELUM DIPERBAIKI** — Dokumen ini hanya untuk audit dan referensi tim developer.

---

*Dibuat oleh: AI Bug Audit — FreshGuard AIT-201 · 14 Nov 2026*

