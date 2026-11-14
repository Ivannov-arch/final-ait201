# Panduan Akses Database Supabase Cloud — FreshGuard

Dokumen ini berisi panduan lengkap untuk mengakses, mengelola, dan menghubungkan aplikasi ke database **Supabase Cloud PostgreSQL** pada proyek **FreshGuard (Dynamic Food Clearing House)**.

---

## 1. Informasi Proyek & Kredensial

| Parameter | Nilai Konfigurasi | Keterangan |
|---|---|---|
| **Project Name** | `Applied Machine Learning` | Proyek resmi Supabase tim |
| **Project Reference ID** | `sccsbjlmpxjligwckqpp` | ID unik instance database |
| **Project URL** | `https://sccsbjlmpxjligwckqpp.supabase.co` | Endpoint REST API & WebSocket |
| **Publishable Key (Anon)** | `sb_publishable_Xpgq-ETg1SUq37N9Qtq-mQ_UEiEO2c-` | Aman untuk frontend browser (Read-only via RLS) |
| **Secret Key (Service Role)** | `[TERSIMPAN AMAN DI FILE .env]` | Digunakan oleh server/backend (Akses penuh / Bypass RLS) |

> ⚠️ **Penting:** Kunci rahasia (*Secret Key*) hanya boleh disimpan di file lingkungan (`.env`) server backend dan **tidak boleh diekspos ke publik atau di-commit ke repositori Git**.

---

## 2. Cara Mengakses via Supabase Web Dashboard (GUI)

Jika Anda ingin melihat isi tabel secara visual atau mengeksekusi query melalui browser:

1. Buka browser dan kunjungi: [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Masuk menggunakan akun Supabase Anda.
3. Pilih proyek **`Applied Machine Learning`** (`sccsbjlmpxjligwckqpp`).

### A. Melihat Isi Data Tabel (Table Editor)
* Pada **sidebar hitam sebelah kiri**, klik ikon **Table Editor** (ikon tabel grid/spreadsheet, urutan ke-2 dari atas di bawah ikon Home 🏠).
* Pilih nama tabel di bawah schema `public`:
  * **`batches`**: Seluruh inventaris produk retail, sisa hari kedaluwarsa (DTE), status stok, harga, dan rekomendasi rute FEFO.
  * **`receivers`**: Daftar lembaga penerima donasi pangan (Food Bank & NGO) terverifikasi di kawasan Lembah Klang beserta koordinat spasialnya.
  * **`simulation_events`**: Rekaman log transaksi kasir (POS), mutasi stok keluar, dan audit trail operasional toko.
  * **`dispatch_log`**: Log pengiriman donasi dan rute armada OSRM.

### B. Menjalankan Query SQL (SQL Editor)
* Pada sidebar kiri, klik ikon **SQL Editor** (ikon terminal `>_`, urutan ke-3 dari atas).
* Klik tombol **"+ New query"** dan masukkan query SQL yang ingin dijalankan:

```sql
-- 1. Melihat 10 batch dengan risiko kadaluarsa tertinggi (FEFO)
SELECT batch_id, product_name, quantity, uom, days_to_expiry, risk_label, recommended_route
FROM batches
ORDER BY days_to_expiry ASC
LIMIT 10;

-- 2. Melihat seluruh batch yang dialokasikan untuk Donasi Food Bank
SELECT batch_id, product_name, quantity, uom, days_to_expiry, unit_price_myr
FROM batches
WHERE recommended_route = 'Donation' OR days_to_expiry <= 1;

-- 3. Melihat ringkasan KPI agregat via view
SELECT * FROM v_dashboard_summary;
```
* Klik tombol **Run** (atau tekan `Ctrl + Enter`) untuk melihat hasilnya.

---

## 3. Cara Mengakses via Kode Pemrograman

### A. JavaScript / React Frontend (`@supabase/supabase-js`)

Gunakan client Supabase yang telah dikonfigurasi di file `frontend/src/services/supabase.js`:

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://sccsbjlmpxjligwckqpp.supabase.co'
const supabaseAnonKey = 'sb_publishable_Xpgq-ETg1SUq37N9Qtq-mQ_UEiEO2c-'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Contoh membaca data stok aktif
export async function getActiveBatches() {
  const { data, error } = await supabase
    .from('batches')
    .select('*')
    .gt('quantity', 0)
    .order('days_to_expiry', { ascending: true })

  if (error) {
    console.error('Gagal mengambil data:', error.message)
    return []
  }
  return data
}
```

---

### B. Node.js Backend / REST API (Menggunakan Secret Key)

Untuk operasi penulisan (*Insert / Update / Delete*), panggil endpoint PostgREST Supabase menggunakan `Secret Key`:

```javascript
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://sccsbjlmpxjligwckqpp.supabase.co'
const SECRET_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY // Tersimpan di .env

const headers = {
  'apikey': SECRET_KEY,
  'Authorization': `Bearer ${SECRET_KEY}`,
  'Content-Type': 'application/json'
}

// 1. Tambah atau Perbarui Batch (Upsert)
async function upsertBatch(batchData) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/batches`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify([batchData])
  })
  return res.status === 201
}

// 2. Potong / Update Kuantitas Stok
async function updateBatchQty(batchId, newQty) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/batches?batch_id=eq.${encodeURIComponent(batchId)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ quantity: newQty })
  })
  return res.ok
}

// 3. Hapus Batch
async function deleteBatch(batchId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/batches?batch_id=eq.${encodeURIComponent(batchId)}`, {
    method: 'DELETE',
    headers
  })
  return res.ok
}
```

---

### C. Python (FastAPI / Data Science)

Menggunakan modul `requests` atau library `supabase`:

```python
import os
import requests

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL", "https://sccsbjlmpxjligwckqpp.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") # Ambil dari environment / .env

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

# Ambil data seluruh batch untuk model ML
response = requests.get(f"{SUPABASE_URL}/rest/v1/batches?select=*", headers=headers)
batches = response.json()
print(f"Total batch terambil: {len(batches)}")
```

---

## 4. Struktur Skema Database Utama

### 1. Tabel `batches`
Menyimpan seluruh data lot inventaris produk supermarket.
* `batch_id` (VARCHAR PK) — Nomor lot (contoh: `LOT-1000`, `LOT-1061`).
* `product_name` (VARCHAR) — Nama produk retail.
* `category` (VARCHAR) — Kategori komoditas (`Produce`, `Dairy`, `Bakery`, dll).
* `quantity` (INT) — Jumlah stok tersisa.
* `uom` (VARCHAR) — Satuan ukuran (`kg`, `pack`, `units`).
* `expiry_date` (DATE) — Tanggal kedaluwarsa.
* `days_to_expiry` (INT) — Sisa hari menuju kedaluwarsa ($DTE$).
* `unit_price_myr` (NUMERIC) — Harga jual standar dalam Ringgit Malaysia (MYR).
* `risk_label` (VARCHAR) — Label klasifikasi risiko (`HIGH`, `MODERATE`, `LOW`).
* `recommended_route` (VARCHAR) — Rute FEFO (`Donation`, `Dynamic Markdown`, `Normal Sale`).

### 2. Tabel `receivers`
Daftar organisasi mitra penerima donasi surplus pangan.
* `receiver_id` (VARCHAR PK) — ID lembaga (contoh: `REC-001`).
* `name` (VARCHAR) — Nama food bank / panti asuhan.
* `latitude`, `longitude` (NUMERIC) — Titik koordinat GPS untuk rute OSRM.
* `daily_capacity_kg` (NUMERIC) — Batas kapasitas penerimaan harian.
* `contact_phone` (VARCHAR) — Nomor kontak verifikasi.

### 3. Tabel `simulation_events`
Rekaman event real-time yang mencatat seluruh alur barang (POS, donasi, audit).
* `event_id` (VARCHAR PK) — ID event unik.
* `batch_id` (VARCHAR FK) — Referensi batch terkait.
* `event_type` (VARCHAR) — Jenis event (`sale`, `donation`, `markdown`, `audit`).
* `timestamp` (TIMESTAMPTZ) — Waktu kejadian tercatat.
* `quantity` (INT) — Jumlah unit yang terlibat.
* `metadata` (JSONB) — Informasi tambahan transaksi (harga, kasir, metode bayar).

---

## 5. Keamanan & Row Level Security (RLS)

* **Hak Akses Publik (`anon`):** Dibatasi hanya untuk perintah `SELECT` pada tabel yang aktif. Ini melindungi database dari manipulasi data langsung melalui inspect element browser pengguna luar.
* **Hak Akses Server (`service_role`):** Mengizinkan eksekusi penuh `INSERT`, `UPDATE`, dan `DELETE`. Digunakan secara eksklusif oleh API middleware Vite lokal dan backend Python.

---

## 6. Pertanyaan Umum & Troubleshooting (FAQ)

### Mengapa batch yang ditambahkan di web sempat tidak terdeteksi?
Web app FreshGuard menggunakan arsitektur *Two-Way Sync*. Saat batch baru ditambahkan lewat dashboard web, data otomatis dikirim ke backend middleware yang menyimpan data tersebut secara paralel ke file lokal dan ke Supabase Cloud menggunakan *Secret Key*. Pastikan server Vite (`npm run dev`) sedang aktif saat melakukan pengujian agar sinkronisasi cloud berjalan lancar.

### Di mana file SQL inisialisasi tabel disimpan?
Skrip DDL dan seeding awal database tersedia di folder repositori:
* [`database/schema.sql`](file:///d:/hahaha/food-cleaning-ait201/database/schema.sql) — Struktur tabel, RLS policy, index, dan view.
* [`database/seed_receivers.sql`](file:///d:/hahaha/food-cleaning-ait201/database/seed_receivers.sql) — Data awal 4 mitra food bank.
* [`scripts/seed_supabase_batches.js`](file:///d:/hahaha/food-cleaning-ait201/scripts/seed_supabase_batches.js) — Skrip Node.js untuk seeding massal seluruh 60+ batch inventaris.
