# DebugLog — FreshGuard

Log solusi yang diterapkan. Format: tanggal, masalah, solusi, bukti.

---

## 2026-11-17 — Integrasi Spoilage Risk ML end-to-end (tanpa retrain)

Konteks: audit menemukan model XGBoost `models/spoilage_classifier.pkl` valid, tetapi di-runtime aplikasi model ter-bypass total ("Ghost ML") — frontend memakai threshold DTE, FastAPI GET membaca label tersimpan, `.venv` tanpa dependency, dan kategori FreshGuard tidak cocok dengan kategori training. Dataset training `7_perishable_goods_cleaned.csv` (89.880 baris) **tidak disentuh**, model Ivannov dipakai 100% tanpa retrain.

### SOL-01: Bridge ML Python persisten untuk frontend
* **Masalah:** Vite middleware (Node) tidak bisa load `.pkl` XGBoost. Semua `fetch('/api/...')` dicegat middleware → model tidak pernah terpanggil dari UI.
* **Solusi:** File baru `src/ml/spoilage_bridge.py` — proses Python persisten, komunikasi JSON per baris lewat stdin/stdout. Model dimuat **sekali**, tiap prediksi hanya milidetik. Protokol: `{"lots":[...]}` → `{"ok":true,"results":[...]}`, sinyal siap `{"event":"ready"}`.
* **Bukti:** Smoke test: Dairy DTE=1 → HIGH 0.9873 (Tier2 aktif).

### SOL-02: Wiring Vite middleware ke model
* **Masalah:** Risk dihitung dari threshold DTE di `rowToBatch`.
* **Solusi:** Di `frontend/vite.config.js`:
  * `predictSpoilageBatch()` + `startSpoilageProc()` — spawn python (kandidat: `FRESHGUARD_PYTHON` env → `python` → `python3`), single in-flight queue, timeout 30s, fallback heuristik DTE bila proses gagal.
  * **GET /api/batches** — bulk predict semua batch aktif, 1 round-trip.
  * **POST /api/batches** — `risk_tier`/`risk_label` dari model, nilai client diabaikan.
  * **PATCH /api/batches/:id** — risk dihitung ulang bila DTE/kategori berubah.
  * Field batch baru: `riskScore` (0–1 kontinu dari `predict_proba`) dan `riskSource` (`ml_xgboost` / `policy_shelf_stable` / `dte_fallback`).
  * Supabase sync otomatis membawa `risk_label` hasil ML.
* **Bukti:** Uji live `GET /api/batches`: 58 batch → 42 `ml_xgboost`, 16 `policy_shelf_stable`. Label ML berbeda dari heuristik DTE (Cheese DTE=3 → HIGH 0.5672; Egg DTE=2 → LOW 0.5714) — pola mustahil dihasilkan threshold DTE.

### SOL-03: Pemisahan departemen ritel — Dry Goods / Shelf-Stable policy
* **Masalah:** Grains & Pulses, Oils & Fats = barang kering non-perishable (umur simpan 1–2 tahun), tidak mengalami pembusukan mikroba. Model dilatih khusus perishable goods → tidak layak memprosesnya.
* **Solusi:** Di `src/ml/spoilage.py`: `SHELF_STABLE_CATEGORIES` + `_predict_shelf_stable_risk()` — early return sebelum inference. DTE > 0 → LOW dengan prob LOW 0.95. DTE ≤ 0 (kadaluarsa) → HIGH 0.95. Response ditandai `department: "Dry Goods (Shelf-Stable)"`, `source: "policy_shelf_stable"`.
* **Bukti:** Rice Flour DTE=14 → LOW 0.95 policy; Oils & Fats DTE=-1 → HIGH 0.95. Cakupan live: 16/58 batch (27,6% ≈ estimasi 28% stok toko).

### SOL-04: Mapping kategori tanpa retrain (`CATEGORY_EQUIVALENCE`)
* **Masalah:** Model terlatih dengan 9 kategori US (Frozen_Meals, Ready_to_Eat, dst.) + 5 region. Kategori FreshGuard yang tidak punya kolom one-hot menghasilkan semua one-hot = 0 → probabilitas degenerat konstan `LOW 0.5681` untuk semua kategori tersebut.
* **Solusi:** Kamus `CATEGORY_EQUIVALENCE` di `src/ml/spoilage.py` dipakai di `preprocess_single_lot` — kategori tak terlatih dipetakan ke kolom terlatih dengan dinamika busuk setara:
  * Produce / Fruits / Vegetables → `Fruits & Vegetables`
  * Poultry / Chicken / Beef / Pork / Meats → `Meat`
  * Prepared Food(s) → `Ready_to_Eat`
  * Frozen Foods / Frozen Meals → `Frozen_Meals`
  * Eggs → `Dairy` (produk hewani berpendingin terdekat)
  * Bread / Pastry → `Bakery`; Drinks → `Beverages`; Fish → `Seafood`
  * SHELF_STABLE diperluas: + Grocery, Dry Goods, Pantry, Snacks, Liquor/Beer/Wine/Liquor-Wine-Beer
* **Bukti:** `test_category_mapping.py` (root): 36 variasi nama kategori → 0 kasus degenerat 0.5681; skor ML bervariasi 0.5524–0.6130; sinonim satu kolom memang berbagi skor (by design). RESULT: PASS.

### SOL-05: FastAPI GET memakai model (sebelumnya bypass)
* **Masalah:** `GET /api/batches` di FastAPI hanya membaca `risk_label` tersimpan / fallback DTE. Satu API, dua sumber risk berbeda.
* **Solusi:** `backend/services/batch_service.py` — helper `_ml_risk(record)` memanggil `predict_spoilage_risk` untuk tiap record (shelf-stable tetap ke policy). `_format_batch_record` prioritas: **model → risk_label tersimpan → heuristik DTE**. Field baru `risk_score`, `risk_source` (schema `backend/schemas/batch.py` di-update, Optional).
* **Bukti:** Uji via python sistem: `get_batches()` → 42 `ml_xgboost` + 16 `policy_shelf_stable`, hasil identik jalur Vite (Anchovies HIGH 0.9791).

### SOL-06: Model cache thread-safe
* **Masalah:** Cache global `_MODEL_PACKAGE` tanpa lock — FastAPI multi-thread bisa double-load pkl (BUG-ML-02).
* **Solusi:** `threading.Lock` + double-check di `_load_model_package` (`src/ml/spoilage.py`).

### SOL-07: Dependency `.venv` + docstring
* **Masalah:** `.venv` tanpa pip/joblib/xgboost/sklearn → import gagal diam-diam → fallback heuristik (akar Ghost ML). Docstring `predict_spoilage_risk` salah sebut "Random Forest".
* **Solusi:** `ensurepip` lalu `pip install joblib xgboost scikit-learn`. Hasil: joblib 1.6.0, xgboost 3.4.1, **sklearn 1.9.1 = persis versi training** → `InconsistentVersionWarning` hilang di jalur `.venv`. Docstring dikoreksi ke XGBoost + arsitektur department-split didokumentasikan.
* **Sisa:** `.venv` masih perlu `pandas fastapi uvicorn` agar `backend/main.py` bisa boot dari venv (install terputus). Jalur UI (Vite + python sistem) tidak terdampak.

### Keterbatasan sadar (keputusan, bukan bug)
1. **Recall MODERATE 3,84%** — model praktis hanya HIGH/LOW; kelas MODERATE praktis tak muncul. Konsekuensi keputusan "model Ivannov 100% tanpa retrain".
2. **Region dummy `Midwest`** untuk semua toko Malaysia — konsisten antar batch, perbandingan relatif adil; nilai region tidak bermakna geografis.
3. **Bakery DTE=2 → LOW 0.7221** — output asli model, bertentangan aturan bisnis DTE≤2; dibiarkan sesuai prinsip "ikutin ML 100%".

### Arsitektur akhir

```
UI (fetch /api/batches)
  → Vite middleware (frontend/vite.config.js)
    → predictSpoilageBatch() ⇄ src/ml/spoilage_bridge.py (proses Python persisten)
      → src/ml/spoilage.py::predict_spoilage_risk
        ├─ SHELF_STABLE_CATEGORIES → policy LOW 0.95 (kadaluarsa → HIGH)
        └─ CATEGORY_EQUIVALENCE → kolom one-hot terlatih → XGBoost + Tier2 decay
  → fallback: heuristik DTE (hanya bila proses Python gagal)

FastAPI (backend/) — jalur identik, langsung import predict_spoilage_risk
```

### Verifikasi ulang
```
python test_category_mapping.py          # mapping kategori: PASS
python src/ml/spoilage.py                # demo inference
cd frontend && npm run dev              # UI live, badge risk dari ML
```
