import sys, os
os.chdir(r"c:\Users\evanc\Favorites\Projects\Applied Machine Learning Final\final-ait201")
sys.path.insert(0, ".")
import pandas as pd
from src.engine.rule_engine import assign_route, evaluate_lot_dataframe

# --- Quick sanity checks on individual calls ---
cases = [
    dict(days_to_expiry=10,  quantity=50, demand_forecast_3d=30, unit_price_myr=20.47),
    dict(days_to_expiry=2,   quantity=50, demand_forecast_3d=10, unit_price_myr=20.47),
    dict(days_to_expiry=1,   quantity=30, demand_forecast_3d=10, unit_price_myr=20.47, total_surplus_volume=200, cumulative_donated_volume=20),
    dict(days_to_expiry=1,   quantity=30, demand_forecast_3d=10, unit_price_myr=20.47, total_surplus_volume=100, cumulative_donated_volume=50),
    dict(days_to_expiry=0,   quantity=20, demand_forecast_3d=5,  unit_price_myr=15.00),
]
print("=== Individual assign_route() Tests ===")
for i, c in enumerate(cases, 1):
    r = assign_route(**c)
    print(f"  [{i}] {r['recommended_route']:22} | discount={r['discount_percent']*100:.0f}% | moral_hazard={r['moral_hazard_flag']} | channel={r['channel']}")
    print(f"       {r['reason'][:95]}")

# --- Bulk evaluation against lots_base.csv ---
print()
print("=== Bulk evaluate_lot_dataframe() on lots_base.csv ===")
df = pd.read_csv("data/processed/lots_base.csv")
routed = evaluate_lot_dataframe(df)
print(f"  Total lots evaluated: {len(routed)}")
print(f"  Route distribution:")
print(routed["recommended_route"].value_counts().to_string())
print(f"  Moral hazard triggers: {routed['moral_hazard_flag'].sum()}")
print(f"  Total expected value (MYR): {routed['expected_value_myr'].sum():,.2f}")
print()
print("  Sample output (first 5 rows):")
cols = ["lot_id","product_name","days_to_expiry","recommended_route","discount_percent","discounted_price_myr","moral_hazard_flag"]
print(routed[cols].head(5).to_string(index=False))

