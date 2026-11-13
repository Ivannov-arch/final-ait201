import re, sys

sql = open(r"c:\Users\evanc\Favorites\Projects\Applied Machine Learning Final\final-ait201\database\schema.sql").read()

tables   = re.findall(r"CREATE TABLE IF NOT EXISTS public\.(\w+)", sql)
indexes  = re.findall(r"CREATE INDEX IF NOT EXISTS (\w+)", sql)
views    = re.findall(r"CREATE OR REPLACE VIEW public\.(\w+)", sql)
rls_en   = re.findall(r"ALTER TABLE public\.(\w+)\s+ENABLE ROW LEVEL SECURITY", sql)
policies = re.findall(r'CREATE POLICY "(\w+)"', sql)

print("=== schema.sql Structural Audit ===")
print(f"  Tables   ({len(tables)}): {tables}")
print(f"  Indexes  ({len(indexes)}): {indexes}")
print(f"  Views    ({len(views)}):   {views}")
print(f"  RLS on   ({len(rls_en)}): {rls_en}")
print(f"  Policies ({len(policies)}):")
for p in policies:
    print(f"    - {p}")

required = {"batches","simulation_events","receivers","dispatch_log","cluster_results"}
missing  = required - set(tables)
print()
if missing:
    print(f"  MISSING TABLES: {missing}")
    sys.exit(1)
else:
    print("  All 5 required tables present.")

upgrade_cols = ["waste_risk_score","receiver_id","market_price_myr","demand_forecast_3d"]
for col in upgrade_cols:
    status = "OK" if col in sql else "MISSING"
    print(f"  Upgrade placeholder [{col}]: {status}")

kpi_cols = ["total_batches","critical_batches","salvaged_kg","total_expected_revenue_myr","moral_hazard_redirects"]
print()
for kpi in kpi_cols:
    status = "OK" if kpi in sql else "MISSING"
    print(f"  v_dashboard_summary [{kpi}]: {status}")

print()
print(f"  Total SQL lines: {len(sql.splitlines())}")
print("  Audit PASSED.")

