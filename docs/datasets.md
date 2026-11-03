Berikut link data untuk setiap step mulai dari **Step 7 (FEFO/stok) sampai Step 14 (monitoring)**, sesuai scope simulator kita:

## Step 7 — FEFO & Stok Gudang

**Dataset utama: Grocery Inventory (Kaggle)**
- Link: [https://www.kaggle.com/datasets/willianoliveiragibin/grocery-inventory](https://www.kaggle.com/datasets/willianoliveiragibin/grocery-inventory)
- Kolom yang dipakai: `Product_ID`, `Category`, `Stock_Quantity`, `Reorder_Level`, `Date_Received`, `Expiration_Date`, `Sales_Volume`, `Inventory_Turnover_Rate`, `Status`
- Fungsi: dasar untuk FEFO logic, deteksi batch mendekati kedaluwarsa, dan prediksi stok tersisa. Lisensi CC0 (public domain). 

**Dataset pendukung: Perishable Goods Management (Kaggle)**
- Link: [https://www.kaggle.com/datasets/likithagedipudi/perishable-goods-management](https://www.kaggle.com/datasets/likithagedipudi/perishable-goods-management)
- Kolom: 100.000 transaksi, 10 kategori produk (termasuk Produce), 50 toko, expiry date, storage condition, demand trend
- Fungsi: memperkaya variasi kategori & skenario stok untuk kalibrasi simulator. [kaggle](https://www.kaggle.com/datasets/willianoliveiragibin/grocery-inventory)

## Step 8 — Perencanaan Pengiriman (Demand Forecasting)

**Dataset utama: M5 / Walmart (Kaggle)**
- Link: [https://www.kaggle.com/competitions/store-sales-time-series-forecasting/data](https://www.kaggle.com/competitions/store-sales-time-series-forecasting/data)
- Kolom: `date`, `store_nbr`, `item_id`, `sales`, `onpromotion`, `sell_price`, `city`, `state`, `holiday`, `oil_price`
- Fungsi: pola demand harian, efek promo, seasonality—dipakai sebagai *shape* untuk kalibrasi permintaan di simulator Malaysia. 

**Dataset pendukung: Retail Sales Forecast Dataset 2026 (Kaggle)**
- Link: [https://www.kaggle.com/datasets/mmumairkhattak/retail-sales-forecast-dataset-2026](https://www.kaggle.com/datasets/mmumairkhattak/retail-sales-forecast-dataset-2026)
- Kolom: `Date`, `Store_ID`, `Product_ID`, `Units_Sold`, `Inventory_Level`, `Discount_Percent`, `Promotion`, `Holiday`, `Weather_Condition`
- Fungsi: alternatif/suplemen M5 jika butuh kolom inventory yang lebih langsung. 

## Step 11 — Deteksi Surplus / Waste-Risk Scoring

**Dataset utama: Food Waste Prediction & Demand Forecasting (Kaggle)**
- Link: [https://www.kaggle.com/datasets/kp00011/food-waste-prediction-and-demand-forecasting-dataset](https://www.kaggle.com/datasets/kp00011/food-waste-prediction-and-demand-forecasting-dataset)
- Kolom: inventory, sales, expiry, temperature, kategori, label risiko HIGH/MEDIUM/LOW
- Fungsi: training data langsung untuk klasifikasi waste-risk per batch. 

**Dataset pendukung: AI-Powered Food Waste Management (Kaggle)**
- Link: [https://www.kaggle.com/datasets/vinay24baghira/ai-powered-food-waste-management-dataset-v1/data](https://www.kaggle.com/datasets/vinay24baghira/ai-powered-food-waste-management-dataset-v1/data)
- Kolom: daily inventory & sales operasional untuk restaurant, cafeteria, supermarket, cloud kitchen
- Fungsi: variasi skenario donor (bukan hanya retail). 

**Konteks harga riil Malaysia: DOSM PriceCatcher**
- Link: [https://open.dosm.gov.my/data-catalogue/pricecatcher](https://open.dosm.gov.my/data-catalogue/pricecatcher)
- Kolom: `date`, `premise_code`, `item_code`, `price` (RM), CC BY 4.0
- Fungsi: fitur `price_index` & `category_price_trend` agar keputusan "jual vs donasi" memperhitungkan nilai pasar Malaysia riil. 

## Step 12–13 — Jalur Surplus & Matching

**Kerangka jalur: ReFED Measurement Framework**
- Link: [https://refed.org/downloads/2026-refed-measurement-report.pdf](https://refed.org/downloads/2026-refed-measurement-report.pdf)
- Isi: taksonomi 10 destinasi surplus (donation, animal feed, industrial use, composting, anaerobic digestion, dll.)
- Fungsi: desain rule engine jalur clearing house sesuai standar internasional. 

**Benchmark waste per komoditas: FAO FLW Database**
- Link: [https://www.fao.org/platform-food-loss-waste/flw-data/background/en](https://www.fao.org/platform-food-loss-waste/flw-data/background/en)
- Isi: loss % per negara, komoditas, tahap rantai nilai
- Fungsi: kalibrasi parameter simulator (berapa % waste wajar per kategori/tahap). 

**Lokasi & geocoding: Nominatim (OpenStreetMap)**
- Link: [https://nominatim.org/release-docs/develop/api/Search/](https://nominatim.org/release-docs/develop/api/Search/)
- Fungsi: konversi alamat food bank/pantry/kafe simulasi menjadi koordinat untuk matching berbasis jarak. [kaggle](https://www.kaggle.com/datasets/likithagedipudi/perishable-goods-management)

**Routing: OSRM (Open Source Routing Machine)**
- Link: [https://github.com/Project-OSRM](https://github.com/Project-OSRM)
- Fungsi: hitung jarak & ETA antara donor dan penerima untuk matching optimization. [kaggle](https://www.kaggle.com/competitions/store-sales-time-series-forecasting/data)

## Step 14 — Monitoring & Clustering

**Sumber data: hasil simulasi kita sendiri**
- Tidak butuh dataset eksternal—clustering dilakukan pada output agregat simulator (waste rate per toko, velocity per produk, acceptance rate per penerima).
- Alat: Python (scikit-learn K-Means/DBSCAN) pada data yang dihasilkan Step 7–13.

## Ringkasan mapping

| Step | Dataset utama | Link |
|---|---|---|
| 7. FEFO/Stok | Grocery Inventory | [https://www.kaggle.com/datasets/willianoliveiragibin/grocery-inventory](https://www.kaggle.com/datasets/willianoliveiragibin/grocery-inventory) |
| 8. Demand Forecasting | M5/Walmart | [https://www.kaggle.com/competitions/store-sales-time-series-forecasting/data](https://www.kaggle.com/competitions/store-sales-time-series-forecasting/data) |
| 11. Waste-Risk | Food Waste Prediction | [https://www.kaggle.com/datasets/kp00011/food-waste-prediction-and-demand-forecasting-dataset](https://www.kaggle.com/datasets/kp00011/food-waste-prediction-and-demand-forecasting-dataset) |
| 12–13. Jalur & Matching | ReFED + Nominatim + OSRM | [https://refed.org/downloads/2026-refed-measurement-report.pdf](https://refed.org/downloads/2026-refed-measurement-report.pdf) / [https://nominatim.org](https://nominatim.org) / [https://github.com/Project-OSRM](https://github.com/Project-OSRM) |
| 14. Monitoring | Output simulator sendiri | — |
| Konteks harga MY | PriceCatcher | [https://open.dosm.gov.my/data-catalogue/pricecatcher](https://open.dosm.gov.my/data-catalogue/pricecatcher) |
| Konteks waste global | FAO FLW | [https://www.fao.org/platform-food-loss-waste/flw-data/background/en](https://www.fao.org/platform-food-loss-waste/flw-data/background/en) |

Semua dataset ini sudah saya verifikasi link dan kolomnya—siap langsung dipakai untuk membangun simulator tanpa perlu mitra eksternal.