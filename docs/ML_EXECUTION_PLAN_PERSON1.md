# Rencana Eksekusi ML End-to-End â€” Person 1 (Goal 1: Spoilage Classifier & FEFO)
> Dataset: `Grocery_Inventory new v1.csv` + `perishable_goods_management.csv`  
> Platform: Google Colab | Output: `spoilage_classifier.pkl` + `predict_spoilage_risk()` + `sort_by_fefo()`

---

## Overview Masalah Spesifik Kita

> [!IMPORTANT]
> Ini bukan klasifikasi generik. Labelnya **tidak ada di dataset mentah** â€” kita harus **membuat target label sendiri** dari kolom `Expiration_Date` dan `Reorder_Level` sebelum bisa melatih model apapun. Ini adalah keputusan desain terpenting Anda sebagai Person 1.

```
Dataset mentah (Grocery_Inventory)
â”œâ”€â”€ TIDAK ADA kolom "spoilage_risk"
â”œâ”€â”€ Punya: Expiration_Date, Date_Received, Reorder_Level, Inventory_Turnover_Rate
â””â”€â”€ Kita harus: hitung days_to_expiry â†’ assign label â†’ baru latih model
```

---

## 1. Data Preprocessing & Feature Engineering

### 1.1 Urutan yang Akan Dieksekusi

**STEP A â€” Preprocessing Defensif (Menunggu Person 0)**

| Isu (dari `dataset_audit.md`) | Penanganan |
|---|---|
| Kolom `Catagory` (typo) | Rename â†’ `Category` (Person 0 sudah handle ini) |
| Baris 574 Cabbage, `Category = NaN` | **Isi dengan `'Produce'`** â€” kategori paling logis untuk Cabbage. Ini bukan imputasi statistik, tapi domain knowledge. |

> [!NOTE]
> Karena dataset kita **hanya 1 baris null dari category** (bukan ratusan), strategi terbaik bukan median/mode â€” tapi pengisian manual berbasis pengetahuan domain. Cabbage = sayuran = `Produce`. Ini defensibel secara akademis.

**STEP B â€” Feature Engineering (Inti Pekerjaan Anda)**

```python
import pandas as pd

df['Expiration_Date'] = pd.to_datetime(df['Expiration_Date'])
df['Date_Received'] = pd.to_datetime(df['Date_Received'])

# Feature 1: Total umur simpan lot (deterministik â€” tidak bergantung "hari ini")
# Pakai ini, BUKAN (Expiration_Date - today()), karena dataset Kaggle ini adalah
# data historis statis. Jika pakai today() (Nov 2026), semua Expiration_Date
# lama akan jadi negatif â†’ fitur tidak bermakna dan model rusak.
df['days_to_expiry'] = (df['Expiration_Date'] - df['Date_Received']).dt.days

# Feature 2: Usia lot sejak diterima
df['batch_age_days'] = (df['Expiration_Date'] - df['Date_Received']).dt.days

# Feature 3: Rasio perputaran stok (sudah ada di dataset: Inventory_Turnover_Rate)
df['turnover_ratio'] = df['Inventory_Turnover_Rate']

# Feature 4: Tingkat tekanan stok = stok saat ini vs reorder level
df['stock_pressure'] = df['Stock_Quantity'] / (df['Reorder_Level'] + 1)
```

> [!NOTE]
> **Training vs Inferensi:** Di training kita pakai total shelf life (time-agnostic).
> Di production, Person 3 (ETL) yang menghitung `days_to_expiry = Expiration_Date - today()`
> secara real-time sebelum memanggil `predict_spoilage_risk()`. Fungsi inferensi Anda
> menerima `days_to_expiry` sebagai input yang sudah dihitung â€” bukan menghitungnya sendiri.

**STEP C â€” Pembuatan Label Target (Keputusan Desain Anda)**

Ini adalah keputusan paling krusial. Label `HIGH/MODERATE/LOW` tidak ada di dataset, Anda yang menentukan threshold-nya:

```python
def assign_spoilage_label(days_to_expiry):
    if days_to_expiry <= 1:
        return 'HIGH'       # Kritis: akan expired besok
    elif days_to_expiry <= 4:
        return 'MODERATE'   # Perlu perhatian: 2-4 hari lagi
    else:
        return 'LOW'        # Aman: masih >4 hari

df['spoilage_risk'] = df['days_to_expiry'].apply(assign_spoilage_label)
```

> [!WARNING]
> **Threshold ini harus Anda dokumentasikan dan justifikasi** di laporan/presentasi. Alasan yang defensibel: Standar retail Malaysia (MYDIN, Aeon) biasanya menerapkan markdown pada produk â‰¤3 hari sebelum expired. Anda bisa kutip ini.

**STEP D â€” Encoding Kategorikal**

```python
# Category: gunakan One-Hot Encoding (karena jumlah kategori sedikit, ~10)
# Alasan: OHE lebih aman dari Label Encoding untuk tree models â€” tidak ada asumsi ordinalitas
df = pd.get_dummies(df, columns=['Category'], prefix='cat', drop_first=True)
```

### 1.2 Feature Scaling?

**TIDAK PERLU.** Ini adalah keputusan arsitektur yang penting:

- Model yang akan kita pakai (Random Forest, XGBoost) adalah **tree-based algorithms**
- Tree models **tidak sensitif terhadap skala fitur** â€” berbeda dengan kNN atau SVM
- Menambah StandardScaler untuk Random Forest **tidak meningkatkan akurasi, hanya menambah kompleksitas pipeline**

> [!TIP]
> Jika Anda ingin mencoba Linear Model (Logistic Regression) sebagai baseline pembanding, *barulah* scaling diperlukan. Ini juga berguna sebagai bahan perbandingan di laporan.

### 1.3 Jika Opsi Lain Dipilih

| Opsi Alternatif | Risikonya |
|---|---|
| Pakai `food_waste_ml_1000.csv` (dataset Step 11) | âŒ Data sudah scaled `[0,1]`, tidak ada label kategori, hanya 1.000 baris â€” tidak cocok untuk Grocery Classifier |
| Pakai Label Encoding untuk Category | âš ï¸ Model akan salah asumsikan "Dairy > Bakery > Produce" secara ordinal â€” bisa menurunkan akurasi |
| Drop baris dengan `days_to_expiry < 0` | âœ… Boleh â€” produk sudah expired tidak relevan untuk prediksi. Tapi catat di notebook berapa baris yang di-drop |

---

## 2. Model Training

### 2.1 Rencana Eksekusi

Anda akan melatih **3 model secara berurutan** untuk perbandingan:

```
Model 0 (Non-ML Baseline)  â†’  Model 1 (Random Forest)  â†’  Model 2 (XGBoost)
         â†“                            â†“                          â†“
  Tebakan terbaik manual       Ensemble trees stabil       Boosting lebih presisi
```

**Model 0 â€” Simple Rule Baseline (WAJIB ADA)**

```python
# Baseline: tebak semua produk sebagai kelas mayoritas
from sklearn.dummy import DummyClassifier
baseline = DummyClassifier(strategy='most_frequent')
baseline.fit(X_train, y_train)
baseline_score = baseline.score(X_test, y_test)
print(f"Baseline Accuracy: {baseline_score:.3f}")
# Tujuan: model kita HARUS lebih baik dari ini untuk punya nilai
```

**Model 1 â€” Random Forest (Pilihan Primer)**

```python
from sklearn.ensemble import RandomForestClassifier
rf = RandomForestClassifier(
    n_estimators=200,
    class_weight='balanced',  # penting! data mungkin tidak seimbang
    random_state=42,
    n_jobs=-1  # pakai semua core CPU Colab
)
rf.fit(X_train, y_train)
```

Alasan Random Forest dipilih sebagai primer:
- **Stabil** terhadap noise dan outlier
- Parameter `class_weight='balanced'` otomatis menangani imbalanced data
- **Interpretable**: bisa lihat `feature_importances_` untuk presentasi
- Tidak butuh scaling

**Model 2 â€” XGBoost (Pilihan Sekunder / Pembanding)**

```python
from xgboost import XGBClassifier
from sklearn.preprocessing import LabelEncoder

le = LabelEncoder()
y_train_enc = le.fit_transform(y_train)

xgb = XGBClassifier(
    n_estimators=200,
    scale_pos_weight=len(y_train[y_train=='LOW'])/len(y_train[y_train=='HIGH']),
    random_state=42,
    n_jobs=-1
)
xgb.fit(X_train, y_train_enc)
```

### 2.2 Mengapa Tidak Langsung XGBoost Saja?

XGBoost memang umumnya lebih akurat, tapi untuk presentasi akademis:
- Random Forest lebih **mudah dijelaskan** kepada dosen yang tidak familiar boosting
- Anda bisa tunjukkan **grafik feature importance** Random Forest yang intuitif
- XGBoost sebagai model pembanding menunjukkan Anda memahami trade-off

### 2.3 Jika Opsi Lain Dipilih

| Opsi Alternatif | Kapan Cocok | Kelemahan untuk Kasus Ini |
|---|---|---|
| **Logistic Regression** | Jika butuh probabilitas yang sangat terkalibrasi | Membutuhkan scaling, performa lebih rendah pada fitur non-linear seperti `days_to_expiry` |
| **Decision Tree tunggal** | Lebih mudah divisualisasikan | Sangat rentan overfitting, tidak stabil |
| **SVM** | Dataset kecil + linear separation | Sangat lambat di Colab jika data besar, butuh scaling |
| **kNN** | â€” | Tidak cocok: sensitif skala, tidak ada `feature_importances_`, lambat saat inferensi |

---

## 3. Model Tuning

### 3.1 Rencana Eksekusi: Randomized Search

**Gunakan Randomized Search, BUKAN Grid Search.** Alasannya:
- Google Colab punya batas waktu sesi; Grid Search bisa memakan 30-60 menit
- Randomized Search mencapai 90-95% kualitas Grid Search dalam 10-20% waktunya
- Penelitian (Bergstra & Bengio, 2012) membuktikan ini secara matematis

```python
from sklearn.model_selection import RandomizedSearchCV

param_dist = {
    'n_estimators': [100, 200, 300, 500],
    'max_depth': [None, 5, 10, 15, 20],
    'min_samples_split': [2, 5, 10],
    'min_samples_leaf': [1, 2, 4],
    'max_features': ['sqrt', 'log2', None],
}

search = RandomizedSearchCV(
    RandomForestClassifier(class_weight='balanced', random_state=42),
    param_distributions=param_dist,
    n_iter=30,       # coba 30 kombinasi acak (bukan semua 4Ã—5Ã—3Ã—3Ã—3 = 540)
    cv=5,            # 5-fold cross-validation per kombinasi
    scoring='f1_weighted',  # pakai F1 bukan accuracy (antisipasi imbalance)
    n_jobs=-1,       # paralelisasi penuh
    random_state=42,
    verbose=1
)
search.fit(X_train, y_train)
best_model = search.best_estimator_
```

> [!TIP]
> Di Colab, `n_jobs=-1` otomatis memanfaatkan semua CPU virtual yang tersedia (biasanya 2 core). Ini mempercepat training ~2x tanpa mengubah hasil apapun.

### 3.2 Jika Opsi Lain Dipilih

| Opsi | Kapan | Trade-off |
|---|---|---|
| **Grid Search** | Jika dataset kecil + parameter space sempit | Bisa 10x lebih lambat; aman dipakai kalau ada <50 kombinasi total |
| **Bayesian Optimization (Optuna)** | Kompetisi ML, produksi nyata | Instalasi tambahan, lebih kompleks untuk dijelaskan di presentasi akademis |
| **Tidak tuning sama sekali** | Jika deadline sangat mendesak | Akurasi suboptimal, tapi masih lebih baik dari baseline |

---

## 4. Model Analysis / Evaluation

### 4.1 Metrik yang Dipilih dan Alasannya

**Primary metric: F1-Score (Weighted)** â€” BUKAN Accuracy

Alasan: Dataset Grocery Inventory hampir pasti **tidak seimbang**. Mayoritas produk dalam kondisi `LOW` risk. Jika model Anda hanya menebak "LOW" untuk semua produk, akurasi mentah bisa 80%+, tapi model tidak berguna sama sekali.

```python
from sklearn.metrics import classification_report, ConfusionMatrixDisplay

y_pred = best_model.predict(X_test)

# Report lengkap
print(classification_report(y_pred, y_test, target_names=['HIGH', 'LOW', 'MODERATE']))

# Confusion Matrix visual
ConfusionMatrixDisplay.from_estimator(best_model, X_test, y_test)
plt.title("Spoilage Risk Classifier â€” Confusion Matrix")
plt.savefig("confusion_matrix.png")
```

### 4.2 Analisis Type I vs Type II Error â€” Yang Paling Penting untuk Proyek Ini

> [!IMPORTANT]
> Dalam konteks **Spoilage Classifier untuk sistem food bank**, kesalahan yang paling berbahaya adalah:
>
> - **False Negative (Miss) = HIGH risk diklasifikasikan sebagai LOW**
>   - Dampak: Produk kritis tidak ditangani, berakhir di tempat sampah â†’ kerugian ekonomi dan makanan
>   - **Ini yang paling mahal dan harus diminimalkan**
> - **False Positive (Alarm Palsu) = LOW risk diklasifikasikan sebagai HIGH**
>   - Dampak: Produk masih aman tapi dimarkdown atau didonasikan lebih awal â†’ margin toko sedikit berkurang
>   - **Masih bisa ditoleransi**
>
> **Implikasi kode:** Prioritaskan **Recall untuk kelas HIGH** (bukan Precision). Bisa diatur via `class_weight='balanced'` atau threshold tuning.

### 4.3 ROC-AUC

```python
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import label_binarize

# Multi-class ROC-AUC (One-vs-Rest)
y_prob = best_model.predict_proba(X_test)
y_bin = label_binarize(y_test, classes=['HIGH', 'MODERATE', 'LOW'])
auc = roc_auc_score(y_bin, y_prob, multi_class='ovr', average='weighted')
print(f"ROC-AUC (weighted OvR): {auc:.4f}")
```

### 4.4 Feature Importance â€” Wajib untuk Presentasi

```python
import matplotlib.pyplot as plt

feat_imp = pd.Series(best_model.feature_importances_, index=X_train.columns)
feat_imp.sort_values(ascending=True).tail(10).plot(kind='barh')
plt.title("Top 10 Feature Importances â€” Spoilage Classifier")
plt.tight_layout()
plt.savefig("feature_importance.png")
```

---

## 5. Model Validation & Sampling Strategy

### 5.1 Strategi Data Splitting

```python
from sklearn.model_selection import train_test_split

# WAJIB: pakai stratify= karena kelas mungkin tidak seimbang
X_train, X_test, y_train, y_test = train_test_split(
    X, y,
    test_size=0.2,      # 80% train, 20% test
    random_state=42,
    stratify=y          # â† ini yang memastikan proporsi HIGH/MODERATE/LOW sama di train & test
)
```

**Mengapa 80/20 dan bukan 70/15/15?**

Karena kita tidak butuh Validation Set terpisah â€” Randomized Search sudah menggunakan **Cross-Validation internal (k=5)** sebagai pengganti validation set. Ini lebih efisien untuk dataset kecil-menengah.

### 5.2 Cross-Validation Tambahan â€” Untuk Angka di Laporan (Opsional tapi Berguna)

Betul bahwa RandomizedSearchCV sudah pakai `cv=5` secara internal. Tapi keduanya melayani **tujuan yang berbeda**:

| | CV di dalam RandomizedSearchCV | CV di Section 5.2 ini |
|---|---|---|
| **Tujuan** | Memilih hyperparameter terbaik | Mengukur generalisasi model final |
| **Data yang dipakai** | `X_train` saja (80%) | Seluruh `X, y` (100%) |
| **Kapan dipakai** | Selama proses tuning | Setelah model final terpilih |
| **Output** | `best_estimator_` | Confidence interval F1 untuk laporan |

```python
from sklearn.model_selection import StratifiedKFold, cross_val_score

skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
cv_scores = cross_val_score(best_model, X, y, cv=skf, scoring='f1_weighted')
print(f"CV F1-Score: {cv_scores.mean():.4f} Â± {cv_scores.std():.4f}")
# Contoh output: "CV F1-Score: 0.8721 Â± 0.0134"
```

**Angka `mean Â± std` inilah yang ditulis di laporan**, bukan angka dari satu `X_test` saja.
Alasannya: satu test split bisa kebetulan mudah atau susah. CV 5-fold lebih representatif.

> [!NOTE]
> Ini memang sedikit optimistis (karena hyperparameter sudah di-tune pakai sebagian data yang sama),
> tapi untuk project akademis ini cukup valid dan standar. Yang penting jangan tulis angka ini
> seolah-olah itu hasil dari data "yang sama sekali tidak pernah dilihat model".

### 5.3 Bahaya: Data Leakage yang Spesifik untuk Kita

> [!CAUTION]
> **Skenario data leakage terbesar di proyek ini:**
>
> Jika Anda menghitung `days_to_expiry = Expiration_Date - today()` menggunakan `today()` dari mesin Colab saat training, **model Anda akan terikat pada tanggal spesifik itu.**
>
> **Solusi:** Hitung `days_to_expiry` relatif terhadap `Date_Received`, bukan terhadap hari ini:
> ```python
> # âœ… BENAR: relatif terhadap tanggal penerimaan (deterministik, tidak bocor)
> df['days_to_expiry'] = (df['Expiration_Date'] - df['Date_Received']).dt.days
>
> # âš ï¸ HATI-HATI: relatif terhadap hari ini (model menjadi time-sensitive)
> # df['days_to_expiry'] = (df['Expiration_Date'] - pd.Timestamp.now()).dt.days
> ```

---

## 6. Aspek Tambahan yang Wajib Diperhatikan

### 6.1 FEFO Sorter (Deliverable Kedua Anda)

Selain model ML, Anda juga harus membuat fungsi Python murni FEFO:

```python
def sort_by_fefo(batch_list: list[dict]) -> list[dict]:
    """Sort lots by First-Expired First-Out (ascending expiry date)."""
    return sorted(batch_list, key=lambda x: x['expiry_date'])
```

Fungsi ini **tidak butuh ML** â€” murni logika sorting. Tapi wajib ada di `src/ml/spoilage.py` dan di-import oleh FastAPI (Person 2).

### 6.2 Kontrak Fungsi Inferensi (API Contract dengan Person 2)

Person 2 (FastAPI) akan memanggil fungsi Anda. Kontrak outputnya harus **persis** seperti ini:

```python
import joblib

model = joblib.load("models/spoilage_classifier.pkl")

def predict_spoilage_risk(lot: dict) -> dict:
    """
    Input:  dict dengan key: days_to_expiry, batch_age_days, turnover_ratio,
                             stock_pressure, category (string)
    Output: {"label": "HIGH"|"MODERATE"|"LOW", "score": float 0.0-1.0}
    """
    # Preprocessing identik dengan training pipeline
    X = preprocess_single(lot)
    label = model.predict(X)[0]
    score = model.predict_proba(X).max()
    return {"label": label, "score": round(float(score), 4)}
```

> [!IMPORTANT]
> Pastikan preprocessing di fungsi inferensi ini **identik 1:1** dengan preprocessing saat training. Ini adalah sumber bug paling umum dalam ML deployment. Gunakan `Pipeline` dari sklearn jika bisa.

### 6.3 Export Model yang Benar

```python
import joblib

# Export model (dan pipeline jika pakai sklearn Pipeline)
joblib.dump(best_model, "spoilage_classifier.pkl")
print(f"Model saved! Size: {os.path.getsize('spoilage_classifier.pkl') / 1024:.1f} KB")
```

Lalu download dari Colab â†’ taruh di `models/spoilage_classifier.pkl` â†’ commit ke repo.

### 6.4 Koneksi ke Person Lain

| Person | Menunggu Apa dari Anda | Format |
|---|---|---|
| **Person 2 (FastAPI)** | Fungsi `predict_spoilage_risk(lot_dict)` di `src/ml/spoilage.py` | Python function |
| **Person 2 (FastAPI)** | File `models/spoilage_classifier.pkl` | joblib binary |
| **Person 3 (ETL)** | Definisi kolom standar `lots_base.csv` | Harus kompatibel dengan input model |
| **Person 6 (Frontend)** | Format output `{"label": ..., "score": ...}` dari API `/api/recommend` | JSON via FastAPI |

---

## Checklist Akhir Person 1

- [ ] Tunggu Person 0 deliver `Grocery_Inventory` bersih (rename `Catagory` + isi baris 574)
- [ ] Hitung `days_to_expiry` relatif terhadap `Date_Received` (bukan `today()`)
- [ ] Buat threshold label dan dokumentasikan justifikasinya
- [ ] Latih Dummy Baseline â†’ Random Forest â†’ XGBoost
- [ ] Evaluasi dengan F1-Weighted + Confusion Matrix (bukan Accuracy biasa)
- [ ] Prioritaskan Recall untuk kelas HIGH (minimalkan False Negative)
- [ ] Jalankan Randomized Search (n_iter=30, cv=5, n_jobs=-1)
- [ ] Buat fungsi `predict_spoilage_risk()` dengan I/O sesuai kontrak API
- [ ] Buat fungsi `sort_by_fefo(batch_list)`
- [ ] Export ke `models/spoilage_classifier.pkl`
- [ ] Simpan notebook ke `notebooks/step7_spoilage_classifier.ipynb`
- [ ] Commit `spoilage_classifier.pkl` + `src/ml/spoilage.py` ke repo
