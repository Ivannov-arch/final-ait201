"""
Evaluasi & Benchmark Model Machine Learning (Regresi Kargo / Surplus Waste Estimation)
======================================================================================
Modul ini membandingkan 4 model regresi untuk estimasi volume/kargo surplus makanan:
1. Linear Regression (Baseline)
2. Decision Tree Regressor
3. Random Forest Regressor
4. XGBoost Regressor (Konfigurasi identik dengan model produksi: dispatch_cargo_estimator.pkl)

Dataset: 11_food_waste_archive_cleaned.csv (8.000 sampel)
Target : Waste_Quantity (kg)
Fitur  : 20 fitur (4 numerik + 16 one-hot categorical) dengan StandardScaler
Split  : Train 80% (6.400) / Test 20% (1.600), random_state=42
Metrik : R² Score, MAE, RMSE, MSE, Training Time
"""

import os
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import RandomForestRegressor
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

# ── 1. Konfigurasi Path & Parameter ──────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent.parent
CLEANED_DATA_PATH = BASE_DIR / "data" / "processed" / "11_food_waste_archive_cleaned.csv"
RAW_DATA_PATH = BASE_DIR / "data" / "raw" / "11. archive" / "food_waste_dataset.csv"

RANDOM_STATE = 42
TEST_SIZE = 0.20

# Fitur yang digunakan (identik dengan model dispatch_cargo_estimator.pkl)
NUMERIC_FEATURES = [
    "Purchase_Quantity",
    "Daily_Demand",
    "Shelf_Life_Days",
    "Storage_Temperature"
]

CATEGORICAL_FEATURES = [
    "Business_Type",
    "Food_Category",
    "Promotion",
    "Weather"
]

TARGET_COL = "Waste_Quantity"       # nama kolom di CSV
TARGET_COL_KG = "Waste_Quantity_kg" # nama internal (Waste_Quantity di-cast ke float, satuan sudah kg)

EXPECTED_FEATURE_COLUMNS = [
    'Purchase_Quantity', 'Daily_Demand', 'Shelf_Life_Days', 'Storage_Temperature',
    'Business_Type_Cafeteria', 'Business_Type_Cloud Kitchen', 'Business_Type_Restaurant', 'Business_Type_Supermarket',
    'Food_Category_Bakery', 'Food_Category_Dairy', 'Food_Category_Fruits', 'Food_Category_Meat',
    'Food_Category_Prepared Food', 'Food_Category_Vegetables',
    'Promotion_No', 'Promotion_Yes',
    'Weather_Cloudy', 'Weather_Hot', 'Weather_Rainy', 'Weather_Sunny'
]

# ── 2. Persiapan Data ────────────────────────────────────────────────────────
def load_and_preprocess_data():
    """Memuat dan melakukan preprocessing data regresi kargo.
    
    Penting:
    - StandardScaler di-FIT sekali pada X_train, lalu di-TRANSFORM ke X_test.
      Setiap model menerima X_test yang sudah di-transform dengan scaler yang sama,
      persis seperti cara model produksi (dispatch_cargo_estimator.pkl) ditraining.
    - Target: Waste_Quantity (integer dari CSV) di-cast ke float → sudah dalam kg.
    """
    if CLEANED_DATA_PATH.exists():
        df = pd.read_csv(CLEANED_DATA_PATH)
    elif RAW_DATA_PATH.exists():
        df = pd.read_csv(RAW_DATA_PATH)
    else:
        raise FileNotFoundError(f"Dataset tidak ditemukan di {CLEANED_DATA_PATH} maupun {RAW_DATA_PATH}")

    # Cast target ke float (satuan sudah kg di dataset ini)
    df[TARGET_COL_KG] = df[TARGET_COL].astype(float)

    # One-hot encoding — identik dengan preprocessing model produksi
    df_encoded = pd.get_dummies(df, columns=CATEGORICAL_FEATURES, drop_first=False)

    # Pastikan urutan dan kelengkapan 20 fitur sesuai dengan model produksi
    for col in EXPECTED_FEATURE_COLUMNS:
        if col not in df_encoded.columns:
            df_encoded[col] = 0.0

    X = df_encoded[EXPECTED_FEATURE_COLUMNS].astype(float)
    y = df_encoded[TARGET_COL_KG].astype(float)

    # Train / Test Split (80:20) dengan random_state=42
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE
    )

    # FIX: StandardScaler di-FIT pada X_train SAJA, bukan pada seluruh dataset.
    # Hal ini mencegah data leakage dan konsisten dengan cara model produksi ditraining.
    # Scaler kemudian di-transform ke X_test (tidak di-fit ulang).
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)   # fit + transform pada train
    X_test_scaled  = scaler.transform(X_test)         # hanya transform pada test

    return X_train_scaled, X_test_scaled, y_train, y_test

# ── 3. Definisi Model Benchmark ──────────────────────────────────────────────
def get_benchmark_models():
    """Mengembalikan daftar model dengan konfigurasi yang konsisten."""
    models = {
        "Linear Regression": LinearRegression(),
        "Decision Tree Regressor": DecisionTreeRegressor(
            random_state=RANDOM_STATE
        ),
        "Random Forest Regressor": RandomForestRegressor(
            n_estimators=100,
            random_state=RANDOM_STATE,
            n_jobs=-1
        ),
        "XGBoost Regressor (Model Saat Ini)": XGBRegressor(
            n_estimators=150,
            learning_rate=0.08,
            max_depth=5,
            subsample=0.85,
            colsample_bytree=0.85,
            random_state=RANDOM_STATE,
            n_jobs=-1,
            objective="reg:squarederror"
        )
    }
    return models

# ── 4. Evaluasi & Komparasi Model ────────────────────────────────────────────
def run_benchmark():
    """Menjalankan evaluasi komparatif 4 model regresi kargo."""
    print("=" * 80)
    print("BENCHMARK EVALUASI MODEL MACHINE LEARNING: REGRESI KARGO (FOOD WASTE)")
    print("=" * 80)
    
    X_train, X_test, y_train, y_test = load_and_preprocess_data()
    print(f"Jumlah Data Latih (Train) : {X_train.shape[0]} sampel")
    print(f"Jumlah Data Uji   (Test)  : {X_test.shape[0]} sampel")
    print(f"Jumlah Fitur              : {X_train.shape[1]} fitur")
    print("-" * 80)

    models = get_benchmark_models()
    results = []

    for name, model in models.items():
        # Pengukuran Waktu Training
        t_start = time.perf_counter()
        model.fit(X_train, y_train)
        train_time = time.perf_counter() - t_start

        # Prediksi Data Uji
        y_pred = model.predict(X_test)

        # Perhitungan Metrik Evaluasi Regresi
        r2 = r2_score(y_test, y_pred)
        mae = mean_absolute_error(y_test, y_pred)
        mse = mean_squared_error(y_test, y_pred)
        rmse = np.sqrt(mse)

        results.append({
            "Model": name,
            "R2 Score": r2,
            "MAE (kg)": mae,
            "RMSE (kg)": rmse,
            "MSE": mse,
            "Train Time (s)": train_time
        })

    # Konversi hasil ke DataFrame
    df_results = pd.DataFrame(results)

    # Cetak Hasil Benchmark
    print("\nHASIL EVALUASI MODEL REGRESI KARGO:")
    print("-" * 80)
    print(df_results.to_string(index=False, formatters={
        "R2 Score": "{:.4f}".format,
        "MAE (kg)": "{:.3f}".format,
        "RMSE (kg)": "{:.3f}".format,
        "MSE": "{:.3f}".format,
        "Train Time (s)": "{:.4f}".format
    }))
    print("-" * 80)

    # Menentukan Model Terbaik
    best_model = df_results.sort_values(by="R2 Score", ascending=False).iloc[0]
    print(f"\n[INFO] Model Terbaik Berdasarkan R2 Score: {best_model['Model']}")
    print(f"       R2 Score : {best_model['R2 Score']:.4f}")
    print(f"       MAE      : {best_model['MAE (kg)']:.3f} kg")
    print(f"       RMSE     : {best_model['RMSE (kg)']:.3f} kg")
    print("=" * 80)

    return df_results

if __name__ == "__main__":
    run_benchmark()
