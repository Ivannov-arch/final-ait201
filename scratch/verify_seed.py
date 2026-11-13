import re

sql = open(r"c:\Users\evanc\Favorites\Projects\Applied Machine Learning Final\final-ait201\database\seed_receivers.sql").read()
ids = re.findall(r"'(RCV-\d+)'", sql)
# Count unique receiver IDs
unique_ids = list(dict.fromkeys(ids))
print(f"Seed receivers: {len(unique_ids)} unique entries")
for rid in unique_ids:
    print(f"  {rid}")

# Basic checks
assert len(unique_ids) == 15, f"Expected 15 receivers, got {len(unique_ids)}"
print("\nAll checks passed.")

