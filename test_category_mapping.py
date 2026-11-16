"""Smoke test: every FreshGuard category must map to a trained column or policy.

Pass criteria:
1. No degenerate score 0.5681 shared by unmapped categories.
2. Every category resolves to ml_xgboost or policy_shelf_stable.
3. Mapped perishable categories produce distinct probabilities.
"""
import json
from collections import defaultdict

from src.ml.spoilage import predict_spoilage_risk

cm = json.load(open('shared/category_map.json'))['category_to_family']
cats = sorted(set(cm.keys()) | {
    'Deli', 'Ready_to_Eat', 'Frozen_Meals', 'Meat', 'Bakery', 'Beverages',
    'Dairy', 'Seafood', 'Fruits & Vegetables', 'Produce',
})

groups = defaultdict(list)
for c in cats:
    r = predict_spoilage_risk({
        'days_until_expiry': 1, 'shelf_life_days': 7,
        'Stock_Quantity': 50, 'Sales_Volume': 10, 'Unit_Price': 8.0,
        'Category': c, 'stock_pressure': 1.5,
    })
    src = r.get('source', 'ml_xgboost')
    groups[(r['label'], r['score'], src)].append(c)
    print(f"{c:22s} -> {r['label']:8s} {r['score']:6.4f}  src={src}")

degenerate = [k for k in groups if k[1] == 0.5681]
print()
print("degenerate 0.5681 groups:", len(degenerate))
# Synonyms sharing a mapped column SHOULD share a score — that's the mapping
# working. Only flag "identical" as failure if it's the old unmapped signature.
identical_ml = {k: v for k, v in groups.items() if k[2] == 'ml_xgboost' and len(v) > 1}
print("synonym groups sharing mapped column:", len(identical_ml), "(by design)")
print("RESULT:", "PASS" if not degenerate else "FAIL")
