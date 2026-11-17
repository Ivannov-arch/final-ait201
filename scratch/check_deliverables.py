import os

checks = {
    'spoilage_classifier.pkl':      'models/spoilage_classifier.pkl',
    'demand_forecast pkl (day1)':   'models/demand_forecast_day_1.pkl',
    'waste_risk_model.pkl':         'models/waste_risk_model.pkl',
    'dispatch_cargo_estimator.pkl': 'models/dispatch_cargo_estimator.pkl',
    'spoilage.py':                  'src/ml/spoilage.py',
    'forecast_service.py':          'src/forecasting/forecast_service.py',
    'dispatch_estimator.py':        'src/ml/dispatch_estimator.py',
    'spoilage_bridge.py':           'src/ml/spoilage_bridge.py',
    'backend/main.py':              'backend/main.py',
    'lots_base.csv':                'data/processed/lots_base.csv',
    'receivers_list.csv':           'data/processed/receivers_list.csv',
    'dispatch_log.csv':             'data/processed/dispatch_log.csv',
    'inventory_master.json':        'data/processed/inventory_master.json',
    'holidays_my.csv':              'data/processed/holidays_my.csv',
    'three_day_forecast.json':      'data/processed/three_day_forecast.json',
    'etl process_store_inventory':  'src/etl/process_store_inventory.py',
}

print("=== Deliverable File Check ===")
for name, path in checks.items():
    exists = os.path.exists(path)
    if exists:
        size = os.path.getsize(path)
        print(f"  [OK  ] {name:40s} {size:>10,} bytes")
    else:
        print(f"  [MISS] {name:40s} NOT FOUND")

# Also scan models/ dir for all pkls
print("\n=== All files in models/ ===")
if os.path.exists('models'):
    for f in sorted(os.listdir('models')):
        p = os.path.join('models', f)
        print(f"  {f:50s} {os.path.getsize(p):>10,} bytes")
