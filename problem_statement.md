# Dynamic Food Clearing House: Dari Reaksi Menjadi Keputusan

## Background: Masalah & Cara Saat Ini

### Rantai pangan saat ini (urutan teknik yang berjalan)

**Tahap Produksi (Step 1–6)**
1. Petani menanam berdasarkan pengalaman, musim, dan perkiraan pasar—bukan permintaan terverifikasi.
2. Input (pupuk, air, pestisida) diberikan seragam, bukan presisi per lahan.
3. Hama/penyakit dideteksi manual dan sering terlambat.
4. Panen dilakukan saat "sudah waktunya" menurut intuisi.
5. Hasil panen disortir manual, kualitas tidak seragam.
6. Stok masuk gudang dengan prinsip FIFO (masuk dulu, keluar dulu)—bukan berdasarkan kedaluwarsa.

**Tahap Distribusi (Step 7–10)**
7. Stok dikelola tanpa prioritas berbasis umur simpan (FEFO belum umum).
8. Pengiriman dijadwalkan reaktif mengikuti pesanan, tanpa prediksi permintaan.
9. Suhu rantai dingin tidak dipantau real-time.
10. Ritel menerima barang dengan validasi kualitas minimal.

**Tahap Waste/Surplus (Step 11–14)**
11. Stok tidak habis terjual, mendekati kedaluwarsa.
12. Toko/kafe baru panik mencari solusi di menit-menit terakhir.
13. Sebagian didonasikan ad-hoc via telepon/WhatsApp, mayoritas terbuang.
14. Tidak ada data sistematis tentang berapa yang terselamatkan vs terbuang.

### Masalah yang ditemukan

| Masalah | Akibat |
|---|---|
| Produksi spekulatif, bukan demand-driven | Overproduction → surplus sejak hulu |
| Stok dikelola buta terhadap umur simpan | Batch bernilai tinggi terbuang lebih dulu |
| Reaksi terhadap surplus terlambat | Makanan layak konsumsi berakhir di landfill |
| Tidak ada insentif untuk mencegah waste | Donasi terbuka memicu moral hazard pembeli (menahan beli demi menunggu donasi gratis) & kanibalisasi penjualan ritel |
| Data tersebar, tidak terhubung | Tidak ada visibilitas, tidak ada akuntabilitas |

FAO mencatat food loss terjadi di hampir semua tahap—produksi, post-harvest, penyimpanan, transportasi, pengolahan—dan sebagian besar karena sistem bereaksi setelah masalah terjadi, bukan mencegahnya. [food.ec.europa](https://food.ec.europa.eu/system/files/2019-10/fw_lib_fao-2019_en.pdf)

## Solusi: Mengubah Paradigma

### Dari "menyelamatkan sisa" menjadi "mengelola umur ekonomis"

**Pertanyaan lama:**
> "Bagaimana menyelamatkan makanan yang sudah tersisa?"

**Pertanyaan baru (0→1):**
> "Pada detik mana sebuah batch harus pindah jalur agar nilai sosial dan ekonominya maksimal?"

Kita tidak membangun aplikasi food rescue. Kita membangun **Dynamic Food Clearing House**—sistem yang memperlakukan setiap batch pangan sebagai **aset dengan umur ekonomis menurun**, lalu secara otomatis menentukan jalur terbaiknya sebelum nilai itu habis.

### Mengapa kita memilih ini

1. **Menyerang akar masalah, bukan gejala** — waste tidak dipandang sebagai kecelakaan di akhir rantai, tapi konsekuensi keputusan yang bisa diintervensi lebih awal.
2. **Data riil tersedia dan saling melengkapi** — PriceCatcher (harga MY), M5 (pola demand), Grocery Inventory (stok/expiry), FAO FLW (benchmark) semuanya terbuka dan bisa disatukan lewat mapping table.
3. **Feasible sebagai simulator solo** — tidak butuh mitra nyata untuk MVP; entitas donor/penerima bisa disimulasikan dengan kalibrasi dari data riil.
4. **Anti-moral-hazard by design** — mencegah moral hazard pembeli yang sengaja menahan pembelian (*strategic waiting*) demi menunggu makanan gratis; donasi disalurkan tertutup ke institusi sosial terverifikasi (*channel segregation*) hanya setelah melalui diskon komersial (*dynamic pricing*), dengan kuota ketat agar tidak mengkanibalisasi penjualan toko.
5. **Skalabel ke eksekusi nyata** — arsitektur tidak berubah saat naik dari simulasi ke pilot; cukup ganti entitas simulasi dengan mitra sungguhan.

## Step Intervensi & ML yang Dipakai

Kita **tidak** menyentuh Step 1–6 (produksi) — itu hanya konteks/sumber data simulasi. Fokus kita mulai dari **Step 7**, titik di mana makanan sudah ada di gudang/ritel dan mulai kehilangan nilai.

| Step | Intervensi | ML/Teknik | Data Sumber | Output |
|---|---|---|---|---|
| **7. FEFO & Stok** | Ya — titik masuk utama | Supervised: spoilage-risk classification | Grocery Inventory, Perishable Goods Mgmt | Prioritas batch: mana yang harus dikirim dulu |
| **8. Perencanaan Kirim** | Ya | Supervised: demand forecasting (time series) | M5/Walmart, Retail Sales Forecast 2026 | Alokasi stok & kuantitas pengiriman per toko |
| **11. Deteksi Surplus** | Ya — inti sistem | Supervised: waste-risk scoring (regression + classification) | M5 + Grocery Inventory + PriceCatcher + FAO FLW (kalibrasi) | Skor risiko: "batch ini X% akan terbuang dalam Y jam" |
| **12. Rekomendasi Jalur** | Ya — inti sistem | Rule engine + dynamic pricing (bukan ML dulu) | ReFED framework + PriceCatcher | Jalur: jual normal → diskon → komersial → donasi → recovery |
| **13. Matching & Dispatch** | Ya — inti sistem | Optimization / greedy matching (bukan ML dulu) | Nominatim (geocoding) + OSRM (routing) + simulasi receiver | Pilih food bank/pantry terbaik, jadwalkan pengambilan |
| **14. Monitoring** | Ya | Unsupervised: clustering (K-Means/DBSCAN) | Output agregat simulator sendiri | Segmentasi toko/produk/penerima berdasarkan pola waste |

### Kenapa ML hanya di titik tertentu?

Karena ML efektif hanya jika:
- **Data tersedia dan terstruktur** (Step 7, 8, 11 punya ini dari dataset publik).
- **Keputusan masih bisa diubah** (batch belum terbuang).
- **Dampak terukur** (kg terselamatkan, waste avoided, waktu matching).

Step 12–13 sengaja pakai **rule engine + optimization**, bukan ML, karena logikanya berbasis aturan bisnis yang jelas (threshold umur, kapasitas, jarak)—ML di sana justru menambah kompleksitas tanpa nilai tambah. ML baru masuk lagi di Step 14 untuk menemukan pola yang tidak terlihat manusia.

## Arsitektur Multi-Sumber

```text
M5 (pola demand) ──┐
PriceCatcher (harga MY) ──┤
Grocery Inventory (stok/expiry) ──┼──→ Mapping Tables ──→ Canonical Schema ──→ Simulator Engine
FAO FLW (benchmark loss) ──┘                                              │
                                                                           ↓
                                                    Generator Batch Surplus (sintetis, terkalibrasi)
                                                                           ↓
                                                    Scoring → Jalur → Matching → Dispatch → Dashboard
```

Semua sumber disatukan lewat **mapping tables** (crop↔item, unit, waktu, lokasi) dan **canonical schema**—bukan digabung mentah. M5 memberi *pola*, PriceCatcher memberi *harga riil*, Grocery Inventory memberi *logika stok*, FAO FLW memberi *benchmark*—masing-masing punya peran, tidak saling menimpa.

## Kalimat Penutup untuk Pitch

> "Sistem lama menunggu makanan jadi sampah baru panik mencari solusi. Sistem kita menilai setiap batch sejak masih bernilai, mendorong penjualan dan diskon dulu, dan hanya mendonasikan sebagai upaya terakhir—dengan ML yang memprediksi risiko waste, bukan manusia yang menebak-nebak. Kami tidak membangun aplikasi food rescue; kami membangun **bursa untuk umur ekonomis pangan**."

**Batas jujur:** sebagai simulator, semua entitas adalah simulasi—tetapi alur, model, metrik dampak, dan arsitektur multi-sumbernya nyata, dan siap naik ke eksekusi sungguhan tanpa mengubah desain.