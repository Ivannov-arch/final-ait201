"""
ML Test Script — Run RandomForest on BEFORE (raw) and AFTER (SMOTE bootstrapped)
data, repeated 5 times with different random seeds to show stability.

Columns used (all numeric, normalised [0,1]):
  Features: quantity, price, expiry_days, temperature,
            day_of_week, is_weekend, predicted_demand, product_encoded
  Target:   risk_level  (LOW / MEDIUM / HIGH)
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    classification_report, accuracy_score,
    confusion_matrix, f1_score
)
import warnings
warnings.filterwarnings('ignore')

SEEDS   = [42, 7, 123, 999, 2024]
FEAT    = ['quantity','price','expiry_days','temperature',
           'day_of_week','is_weekend','predicted_demand','product_encoded']
TARGET  = 'risk_level'

RAW_PATH   = 'data/processed/11_food_waste_ml_cleaned.csv'
SMOTE_PATH = 'data/processed/bootstrapped/11_food_waste_ml_bootstrapped.csv'

# ── Load data ────────────────────────────────────────────────────────────────
df_raw   = pd.read_csv(RAW_PATH)
df_smote = pd.read_csv(SMOTE_PATH)

print('=' * 70)
print('ML BENCHMARK: Before vs After SMOTE (5 seeds)')
print('=' * 70)
print(f'\nRAW dataset  : {len(df_raw)} rows')
print(f'  Class dist : {df_raw[TARGET].value_counts().to_dict()}')
print(f'\nSMOTE dataset: {len(df_smote)} rows')
print(f'  Class dist : {df_smote[TARGET].value_counts().to_dict()}')
print()

# ── Helper ───────────────────────────────────────────────────────────────────
def run_trial(df, seed, label):
    X = df[FEAT]
    y = df[TARGET]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=seed, stratify=y
    )
    clf = RandomForestClassifier(n_estimators=200, random_state=seed,
                                 class_weight='balanced', n_jobs=-1)
    clf.fit(X_train, y_train)
    y_pred = clf.predict(X_test)

    acc    = accuracy_score(y_test, y_pred)
    wf1    = f1_score(y_test, y_pred, average='weighted', zero_division=0)
    report = classification_report(y_test, y_pred, zero_division=0, output_dict=True)

    high_recall = report.get('HIGH', {}).get('recall', 0)
    med_recall  = report.get('MEDIUM', {}).get('recall', 0)
    low_recall  = report.get('LOW',  {}).get('recall', 0)

    return {
        'label'      : label,
        'seed'       : seed,
        'acc'        : acc,
        'w_f1'       : wf1,
        'recall_HIGH': high_recall,
        'recall_MED' : med_recall,
        'recall_LOW' : low_recall,
        'report'     : report,
        'cm'         : confusion_matrix(y_test, y_pred,
                                        labels=['HIGH','MEDIUM','LOW']),
        'y_test'     : y_test,
        'y_pred'     : y_pred,
    }

# ── Run all trials ────────────────────────────────────────────────────────────
raw_results   = []
smote_results = []

for seed in SEEDS:
    print(f'Running seed {seed}...', end='  ', flush=True)
    raw_results.append(run_trial(df_raw,   seed, 'RAW'))
    smote_results.append(run_trial(df_smote, seed, 'SMOTE'))
    print('done')

# ── Print per-seed table ──────────────────────────────────────────────────────
print('\n' + '=' * 70)
print('PER-SEED RESULTS')
print('=' * 70)
header = f"{'Seed':>6}  {'Dataset':<8}  {'Accuracy':>8}  {'W-F1':>6}  {'Recall HIGH':>11}  {'Recall MED':>10}  {'Recall LOW':>10}"
print(header)
print('-' * 70)
for r_raw, r_sm in zip(raw_results, smote_results):
    for r in [r_raw, r_sm]:
        print(f"{r['seed']:>6}  {r['label']:<8}  {r['acc']:>8.1%}  {r['w_f1']:>6.3f}  "
              f"{r['recall_HIGH']:>11.1%}  {r['recall_MED']:>10.1%}  {r['recall_LOW']:>10.1%}")
    print()

# ── Averages ──────────────────────────────────────────────────────────────────
def avg(results, key):
    return np.mean([r[key] for r in results])

print('=' * 70)
print('AVERAGES ACROSS 5 SEEDS')
print('=' * 70)
print(f"{'Metric':<20}  {'RAW (Before)':>14}  {'SMOTE (After)':>14}  {'Change':>10}")
print('-' * 65)
metrics = [
    ('Accuracy',    'acc'),
    ('Weighted F1', 'w_f1'),
    ('Recall HIGH', 'recall_HIGH'),
    ('Recall MED',  'recall_MED'),
    ('Recall LOW',  'recall_LOW'),
]
for name, key in metrics:
    r = avg(raw_results, key)
    s = avg(smote_results, key)
    delta = s - r
    arrow = '+' if delta > 0.005 else ('-' if delta < -0.005 else '~')
    print(f"{name:<20}  {r:>14.1%}  {s:>14.1%}  {arrow}{abs(delta):>8.1%}")

# ── Detailed report for last seed (cleanest snapshot) ─────────────────────────
print('\n' + '=' * 70)
print('DETAILED CLASSIFICATION REPORT — Seed 2024 (last run)')
print('=' * 70)
for r in [raw_results[-1], smote_results[-1]]:
    print(f"\n--- {r['label']} dataset ---")
    rpt = r['report']
    print(f"{'':>10}  {'precision':>10}  {'recall':>8}  {'f1':>6}  {'support':>8}")
    for cls in ['HIGH','MEDIUM','LOW']:
        if cls in rpt:
            p, re, f, s = (rpt[cls]['precision'], rpt[cls]['recall'],
                           rpt[cls]['f1-score'], rpt[cls]['support'])
            print(f"{cls:>10}  {p:>10.3f}  {re:>8.3f}  {f:>6.3f}  {s:>8}")
    print(f"\n  Accuracy : {rpt['accuracy']:.3f}")
    print(f"  Macro F1 : {rpt['macro avg']['f1-score']:.3f}")
    print(f"  Wt'd F1  : {rpt['weighted avg']['f1-score']:.3f}")

    # Confusion matrix
    cm = r['cm']
    print(f"\n  Confusion matrix (rows=actual, cols=predicted):")
    print(f"           HIGH  MED  LOW")
    labels_ = ['HIGH','MEDIUM','LOW']
    for i, row_lbl in enumerate(labels_):
        print(f"  {row_lbl:>6} : {cm[i]}")

print('\n=== DONE ===')
