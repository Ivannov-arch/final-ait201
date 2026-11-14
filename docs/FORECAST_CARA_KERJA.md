# 📊 Cara Kerja Demand Forecasting — FreshGuard

> Dokumen ini menjelaskan **alur lengkap sistem forecast**, dari training ML model sampai angka demand yang masuk ke Rule Engine.

---

## 1. Overview

FreshGuard menggunakan **LightGBM (Gradient Boosting)** untuk memprediksi demand 3 hari ke depan per kategori produk per toko. Output model dipakai langsung oleh:
- **DemandForecastingPage** — visualisasi chart sell-through
- **Rule Engine** — keputusan action (Normal Sale / Markdown / Donate)

---

## 2. Pipeline Lengkap

```
Historical Sales Data
(8_m5_train_food_cleaned.csv)
         │
         ▼
   [Training — Person 2]
   src/forecasting/train_final.py
         │
         ▼
   models/
   ├── demand_forecast_final_day_1.pkl  ← prediksi Day +1
   ├── demand_forecast_final_day_2.pkl  ← prediksi Day +2
   └── demand_forecast_final_day_3.pkl  ← prediksi Day +3
         │
         ▼
   [Inference — forecast_future.py]
   Load .pkl → generate predictions untuk semua
   store × family combinations
         │
         ▼
   data/processed/three_day_forecast.json
   (store_nbr, family, horizon, predicted_demand)
         │
         ▼
   [Vite Middleware — vite.config.js]
   GET /api/forecast/products
   Disaggregasi: store-level → per-produk (pakai weight stok)
         │
         ├──────────────────────────────────┐
         ▼                                  ▼
  DemandForecastingPage           InventoryFefoRiskPage
  Chart 3-hari + reorder alert    Fetch ML demand → kirim ke
                                  POST /api/recommend
                                         │
                                         ▼
                                   Rule Engine
                                   Putuskan action
```

---

## 3. Training Data & Model

| Item | Detail |
|---|---|
| Data | `data/processed/8_m5_train_food_cleaned.csv` (M5 Forecasting dataset, food segment) |
| Model | LightGBM (Gradient Boosting Decision Tree) |
| Output | 3 model terpisah — satu per horizon (Day+1, Day+2, Day+3) |
| File | `models/demand_forecast_final_day_{1,2,3}.pkl` |
| Artifact | `{ "model": lgbm, "features": [...], "family_categories": [...], "horizon": n }` |

**Features yang dipakai model:**

```python
lag_1, lag_2, lag_3     # sales kemarin, 2 hari lalu, 3 hari lalu
lag_7, lag_14           # sales minggu lalu, 2 minggu lalu
rolling_mean_7          # rata-rata 7 hari terakhir
rolling_mean_14         # rata-rata 14 hari terakhir
target_dayofweek        # hari dalam seminggu (Mon=0, Sun=6)
target_month            # bulan
target_day              # tanggal
target_is_weekend       # boolean: Sabtu/Minggu
family                  # kategori produk (categorical: BEVERAGES, DAIRY, dll)
store_nbr               # nomor toko
```

---

## 4. Inference: `.pkl` → `three_day_forecast.json`

Script: `src/forecasting/forecast_future.py`

```python
for horizon in [1, 2, 3]:
    model_file = f"models/demand_forecast_final_day_{horizon}.pkl"
    artifact = joblib.load(model_file)        # load .pkl
    model    = artifact["model"]
    features = artifact["features"]

    # Build feature matrix dari historical sales
    X = pd.DataFrame(records)[features]

    # Predict
    predictions = np.maximum(model.predict(X), 0)  # no negative demand
```

Output JSON per record:
```json
{
  "store_nbr": 1,
  "family": "BEVERAGES",
  "horizon": 1,
  "predicted_demand": 2269.181
}
```

> **Catatan:** Prediksi ini level **store × category** (bukan per-produk). Satu toko bisa ada 14 food families. Total records = 54 stores × 14 families × 3 horizons = **2,268 records**.

---

## 5. Disaggregasi: Store-Level → Per Produk

**File:** `frontend/vite.config.js` → `GET /api/forecast/products`

Karena model prediksi level category, perlu dipecah ke produk individual dengan **weight berdasarkan proporsi stok**:

```
weight = stok_produk / stok_total_kategori

demand_produk_hx = predicted_demand[category][horizon] × weight
```

### Contoh: White Tea (BEVERAGES)

```
Stok White Tea        = 190 unit
Total stok BEVERAGES  = 303 unit
Weight                = 190 / 303 = 0.627

BEVERAGES Day+1 prediction (store 1) = 2269 unit
White Tea demand Day+1 = 2269 × 0.627 = 1423 unit

(× 3 hari → totalDemand ≈ 3790)
```

**Produk yang tidak ada di ML training set** (produk custom/baru):  
→ Fallback ke heuristik: `stock × 0.35 / 0.30 / 0.25` (demand decay curve)

---

## 6. Input ke Rule Engine

**File:** `frontend/src/components/dashboard/InventoryFefoRiskPage.jsx`

Ketika user buka modal "Determine Stock Action":

```js
// 1. Fetch ML demand untuk produk ini
fetch('/api/forecast/products?store_nbr=1&limit=200')
  .then(data => {
    const pd = data.products[b.product]
    const mlDemand3d = pd ? pd.totalDemand : qty * 0.6  // fallback jika tidak ada
    
    // 2. Kirim ke Rule Engine
    return fetch('/api/recommend', {
      body: JSON.stringify({
        days_to_expiry: b.dteNum,
        quantity: qty,
        unit_price_myr: price,
        demand_forecast_3d: mlDemand3d,  // ← dari ML
        ...
      })
    })
  })
```

**Rule Engine** (`vite.config.js` → `POST /api/recommend`) pakai demand ini untuk:

```
isSurplus = qty > demand_forecast_3d

if DTE > 3 OR !isSurplus  → Normal Sale (full price)
if 1 < DTE ≤ 3            → Dynamic Markdown
  DTE = 3  → 15% off
  DTE = 2  → 25% off
  DTE = 1  → 40% off
if DTE ≤ 1 AND quota < 30% → Donation
if donation quota penuh     → 50% aggressive markdown (Anti-Moral-Hazard)
```

---

## 7. Console Log Verifikasi

Ketika app load, buka DevTools → Console. Jika ML aktif:

```
[FreshGuard Forecast] ✅ ML model active (LightGBM — Person 2)
  Source : data/processed/three_day_forecast.json (from demand_forecast_final_day_*.pkl)
  Products loaded : 52
  Store : store_nbr=1
  ┌──────────────────┬────────────┬────────┬─────────────┬──────────────┐
  │ (name)           │ mlFamily   │ weight │ totalDemand │ currentStock │
  ├──────────────────┼────────────┼────────┼─────────────┼──────────────┤
  │ White Tea        │ BEVERAGES  │ 0.6271 │ 3790        │ 190          │
  │ Anchovies        │ SEAFOOD    │ 0.8454 │ 88          │ 164          │
  │ ...              │ ...        │ ...    │ ...         │ ...          │
```

Jika ML gagal:
```
[FreshGuard Forecast] ⚠ ML forecast unavailable — using heuristic fallback
```

---

## 8. Summary: Dua Sumber Demand

| Konteks | Rumus | Source |
|---|---|---|
| **Produk ada di ML** | `store_forecast × weight` | `three_day_forecast.json` (dari `.pkl`) |
| **Produk baru/tidak ada di training** | `stock × 0.35 / 0.30 / 0.25` | Heuristik decay curve |
| **Rule Engine fallback** | `qty × 0.60` | Jika `/api/forecast/products` gagal |

---

## 9. File Referensi

| File | Peran |
|---|---|
| `models/demand_forecast_final_day_*.pkl` | Trained LightGBM models (Person 2) |
| `src/forecasting/forecast_future.py` | Load `.pkl` → generate `three_day_forecast.json` |
| `data/processed/three_day_forecast.json` | Output ML, dibaca Vite middleware |
| `frontend/vite.config.js` → `/api/forecast/products` | Disaggregasi store-level → per-produk |
| `frontend/src/components/dashboard/DemandForecastingPage.jsx` | Visualisasi chart + merge live stok |
| `frontend/src/components/dashboard/InventoryFefoRiskPage.jsx` | Fetch ML demand → kirim ke Rule Engine |
| `frontend/vite.config.js` → `/api/recommend` | Rule Engine (Person 4 logic) |

---

> **TL;DR:** `.pkl` beneran dipakai. LightGBM predict demand per store × category, hasilnya di-disaggregasi ke per-produk pakai weight stok live dari `inventory_master.json`, lalu masuk ke Rule Engine untuk keputusan action.
