"""
Person 1 ML Benchmark — Grocery Inventory spoilage_risk
========================================================
Simulates EXACTLY what Person 1's model experiences:

  SCENARIO A (Before Fix):
    - Load raw grocery inventory
    - Drop all rows where days_until_expiry < 0  (what Person 1 had to do)
    - Label spoilage_risk based on days_until_expiry thresholds
    - Train RandomForest, evaluate 5 times

  SCENARIO B (After Fix 1):
    - Load our fixed grocery inventory (all 496 broken rows now repaired)
    - Label spoilage_risk — same thresholds
    - Train RandomForest, evaluate 5 times

Spoilage risk thresholds (domain logic):
  HIGH     : days_until_expiry <= 30   (expires within a month)
  MODERATE : 31 <= days <= 90          (expires in 1-3 months)
  LOW      : days > 90                 (expires in 3+ months)

Features used: Stock_Quantity, Unit_Price, Sales_Volume,
               Inventory_Turnover_Rate, Reorder_Quantity,
               Reorder_Level, percentage, days_until_expiry
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.metrics import (
    classification_report, accuracy_score,
    confusion_matrix, f1_score
)
import warnings
warnings.filterwarnings('ignore')

SEEDS   = [42, 7, 123, 999, 2024]
TARGET  = 'spoilage_risk'
FEAT    = ['Stock_Quantity','Unit_Price','Sales_Volume',
           'Inventory_Turnover_Rate','Reorder_Quantity',
           'Reorder_Level','percentage','days_until_expiry']

RAW_PATH   = 'data/raw/7. Grocery_Inventory new v1.csv'
FIXED_PATH = 'data/processed/7_grocery_inventory_cleaned.csv'


# ── Labelling function (same thresholds for both scenarios) ───────────────────
def label_spoilage(df):
    conditions = [
        df['days_until_expiry'] <= 30,
        (df['days_until_expiry'] > 30) & (df['days_until_expiry'] <= 90),
    ]
    choices = ['HIGH', 'MODERATE']
    df = df.copy()
    df[TARGET] = np.select(conditions, choices, default='LOW')
    return df


# ── Build Scenario A: Person 1's world BEFORE our fix ────────────────────────
print('Building Scenario A (BEFORE fix — simulating Person 1 raw experience)...')
df_raw = pd.read_csv(RAW_PATH)
df_raw = df_raw.rename(columns={'Catagory': 'Category'})
df_raw['Unit_Price']  = df_raw['Unit_Price'].astype(str).str.replace('$','',regex=False).str.strip()
df_raw['Unit_Price']  = pd.to_numeric(df_raw['Unit_Price'], errors='coerce')
df_raw['percentage']  = df_raw['percentage'].astype(str).str.replace('%','',regex=False).str.strip()
df_raw['percentage']  = pd.to_numeric(df_raw['percentage'], errors='coerce') / 100
df_raw['Date_Received']   = pd.to_datetime(df_raw['Date_Received'],   errors='coerce')
df_raw['Expiration_Date'] = pd.to_datetime(df_raw['Expiration_Date'], errors='coerce')
df_raw['days_until_expiry'] = (df_raw['Expiration_Date'] - df_raw['Date_Received']).dt.days

# Person 1 had to drop broken rows — this is the core problem
df_before = df_raw[df_raw['days_until_expiry'] >= 0].copy().reset_index(drop=True)
df_before = label_spoilage(df_before)
df_before = df_before[FEAT + [TARGET]].dropna()

print(f'  Rows after dropping broken: {len(df_before)}')
print(f'  Class dist: {df_before[TARGET].value_counts().to_dict()}')


# ── Build Scenario B: After our Fix 1 ────────────────────────────────────────
print('\nBuilding Scenario B (AFTER Fix 1 — 496 rows repaired)...')
df_fixed = pd.read_csv(FIXED_PATH)
df_fixed = label_spoilage(df_fixed)
df_fixed = df_fixed[FEAT + [TARGET]].dropna()

print(f'  Rows (all repaired): {len(df_fixed)}')
print(f'  Class dist: {df_fixed[TARGET].value_counts().to_dict()}')


# ── Trial runner ──────────────────────────────────────────────────────────────
def run_trial(df, seed):
    X = df[FEAT]
    y = df[TARGET]

    # Stratified split — keep class proportions in test set
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=seed, stratify=y
    )

    clf = RandomForestClassifier(
        n_estimators=300,
        random_state=seed,
        class_weight='balanced',
        n_jobs=-1
    )
    clf.fit(X_train, y_train)
    y_pred = clf.predict(X_test)

    rpt = classification_report(y_test, y_pred, zero_division=0, output_dict=True)
    cm  = confusion_matrix(y_test, y_pred, labels=['HIGH','MODERATE','LOW'])

    return {
        'seed'          : seed,
        'acc'           : accuracy_score(y_test, y_pred),
        'w_f1'          : f1_score(y_test, y_pred, average='weighted', zero_division=0),
        'macro_f1'      : f1_score(y_test, y_pred, average='macro', zero_division=0),
        'recall_HIGH'   : rpt.get('HIGH',     {}).get('recall', 0),
        'recall_MOD'    : rpt.get('MODERATE', {}).get('recall', 0),
        'recall_LOW'    : rpt.get('LOW',      {}).get('recall', 0),
        'precision_HIGH': rpt.get('HIGH',     {}).get('precision', 0),
        'support_HIGH'  : rpt.get('HIGH',     {}).get('support', 0),
        'support_MOD'   : rpt.get('MODERATE', {}).get('support', 0),
        'support_LOW'   : rpt.get('LOW',      {}).get('support', 0),
        'cm'            : cm,
        'report'        : rpt,
        'y_test'        : y_test,
        'y_pred'        : y_pred,
    }


# ── Run all trials ────────────────────────────────────────────────────────────
print()
before_results = []
after_results  = []

for seed in SEEDS:
    print(f'Seed {seed}...', end='  ', flush=True)
    before_results.append(run_trial(df_before, seed))
    after_results.append(run_trial(df_fixed,  seed))
    print('done')


# ══════════════════════════════════════════════════════════════════════════════
# RESULTS
# ══════════════════════════════════════════════════════════════════════════════

SEP  = '=' * 72
SEP2 = '-' * 72

print(f'\n{SEP}')
print('PERSON 1 ML BENCHMARK: BEFORE vs AFTER FIX 1 (5 seeds)')
print(SEP)

print(f'\nScenario A (Before): {len(df_before)} rows | {df_before[TARGET].value_counts().to_dict()}')
print(f'Scenario B (After) : {len(df_fixed)} rows  | {df_fixed[TARGET].value_counts().to_dict()}')

# ── Per-seed table ────────────────────────────────────────────────────────────
print(f'\n{SEP}')
print('PER-SEED RESULTS')
print(SEP)
hdr = f"{'Seed':>5}  {'Scenario':<8}  {'Acc':>6}  {'WF1':>5}  {'MacroF1':>7}  {'R:HIGH':>7}  {'R:MOD':>7}  {'R:LOW':>7}  {'HIGH support':>13}"
print(hdr)
print(SEP2)

for b, a in zip(before_results, after_results):
    for r, label in [(b, 'BEFORE'), (a, 'AFTER ')]:
        print(f"{r['seed']:>5}  {label:<8}  "
              f"{r['acc']:>6.1%}  {r['w_f1']:>5.3f}  {r['macro_f1']:>7.3f}  "
              f"{r['recall_HIGH']:>7.1%}  {r['recall_MOD']:>7.1%}  {r['recall_LOW']:>7.1%}  "
              f"{int(r['support_HIGH']):>8} samples")
    print()


# ── Averages & spread ─────────────────────────────────────────────────────────
def stats(results, key):
    vals = [r[key] for r in results]
    return np.mean(vals), np.std(vals), min(vals), max(vals)

print(SEP)
print('AVERAGES & SPREAD ACROSS 5 SEEDS')
print(SEP)
print(f"{'Metric':<18}  {'BEFORE mean':>12}  {'BEFORE std':>11}  {'AFTER mean':>11}  {'AFTER std':>10}  {'Change':>8}")
print(SEP2)

metrics = [
    ('Accuracy',     'acc'),
    ('Weighted F1',  'w_f1'),
    ('Macro F1',     'macro_f1'),
    ('Recall HIGH',  'recall_HIGH'),
    ('Recall MOD',   'recall_MOD'),
    ('Recall LOW',   'recall_LOW'),
]

for name, key in metrics:
    bm, bs, blo, bhi = stats(before_results, key)
    am, as_, alo, ahi = stats(after_results,  key)
    delta = am - bm
    sign  = '+' if delta > 0.001 else ('-' if delta < -0.001 else '~')
    print(f"{name:<18}  {bm:>12.1%} +/-{bs:>6.1%}   {am:>11.1%} +/-{as_:>6.1%}  {sign}{abs(delta):>7.1%}")

print()
print('Spread = standard deviation across 5 seeds (lower = more consistent/stable)')


# ── Confusion matrices for last seed ─────────────────────────────────────────
print(f'\n{SEP}')
print('CONFUSION MATRICES — Seed 2024 (last run)')
print(SEP)
for r, label in [(before_results[-1], 'BEFORE'), (after_results[-1], 'AFTER FIX 1')]:
    print(f'\n--- {label} ---')
    rpt = r['report']
    print(f"{'':>10}  {'precision':>10}  {'recall':>8}  {'f1':>6}  {'support':>8}")
    for cls in ['HIGH','MODERATE','LOW']:
        if cls in rpt:
            p  = rpt[cls]['precision']
            re = rpt[cls]['recall']
            f  = rpt[cls]['f1-score']
            s  = int(rpt[cls]['support'])
            flag = ' <-- KEY' if cls == 'HIGH' else ''
            print(f"{cls:>10}  {p:>10.3f}  {re:>8.3f}  {f:>6.3f}  {s:>8}{flag}")
    print(f"\n  Accuracy : {rpt['accuracy']:.3f}")
    print(f"  Macro F1 : {rpt['macro avg']['f1-score']:.3f}")
    print(f"  Wt'd F1  : {rpt['weighted avg']['f1-score']:.3f}")
    cm = r['cm']
    print(f"\n  Confusion matrix (rows=actual, cols=predicted)  [HIGH | MOD | LOW]")
    for i, row_lbl in enumerate(['HIGH','MODERATE','LOW']):
        print(f"  {row_lbl:>9} : {cm[i]}")


# ── Stability analysis ────────────────────────────────────────────────────────
print(f'\n{SEP}')
print('STABILITY ANALYSIS — Recall HIGH across all seeds')
print(SEP)
print(f"{'Seed':>6}  {'BEFORE':>10}  {'AFTER':>10}  {'Delta':>8}")
print(SEP2)
for b, a in zip(before_results, after_results):
    d = a['recall_HIGH'] - b['recall_HIGH']
    s = '+' if d > 0.001 else ('-' if d < -0.001 else '~')
    print(f"{b['seed']:>6}  {b['recall_HIGH']:>10.1%}  {a['recall_HIGH']:>10.1%}  {s}{abs(d):>7.1%}")

bvals = [r['recall_HIGH'] for r in before_results]
avals = [r['recall_HIGH'] for r in after_results]
print(f"\n  BEFORE range: {min(bvals):.1%} - {max(bvals):.1%}  (spread {max(bvals)-min(bvals):.1%})")
print(f"  AFTER  range: {min(avals):.1%} - {max(avals):.1%}  (spread {max(avals)-min(avals):.1%})")

print('\n=== DONE ===')
