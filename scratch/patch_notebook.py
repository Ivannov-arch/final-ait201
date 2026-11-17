"""
Patch step7_spoilage_classifier.ipynb:
- Cell 12: 24 features + region -> 19 features, region-agnostic
- Cell 13: CATEGORICAL_COLS remove "region"
- Cell 27: remove grocery_mapped["region"] line; drop "region" from get_dummies
- Cell 32: remove "region": "Midwest" from sample lot; update accuracy to 67.33%
"""
import json

NOTEBOOK_PATH = "notebooks/step7_spoilage_classifier.ipynb"

with open(NOTEBOOK_PATH, "r", encoding="utf-8") as f:
    nb = json.load(f)

# ── Cell 12 ─────────────────────────────────────────────────────────────────
nb["cells"][12]["source"] = [
    line.replace(
        "categorical features (`category`, `region`). This generates exactly 24 production-ready feature columns.",
        "categorical features (`category`). This generates exactly 19 production-ready feature columns (region-agnostic)."
    )
    for line in nb["cells"][12]["source"]
]

# ── Cell 13 ─────────────────────────────────────────────────────────────────
nb["cells"][13]["source"] = [
    line.replace('CATEGORICAL_COLS = ["category", "region"]', 'CATEGORICAL_COLS = ["category"]')
    for line in nb["cells"][13]["source"]
]

# ── Cell 27 ─────────────────────────────────────────────────────────────────
new_c27 = []
for line in nb["cells"][27]["source"]:
    # Remove the region injection line entirely
    if 'grocery_mapped["region"]' in line:
        continue
    # Fix get_dummies columns list
    line = line.replace('columns=["category", "region"]', 'columns=["category"]')
    new_c27.append(line)
nb["cells"][27]["source"] = new_c27

# ── Cell 32 ─────────────────────────────────────────────────────────────────
new_c32 = []
for line in nb["cells"][32]["source"]:
    # Remove "region": "Midwest" key line from the sample dict
    if '"region": "Midwest"' in line:
        continue
    # Update accuracy stat to match retrained 19-feature model
    line = line.replace("67.41%", "67.33%")
    new_c32.append(line)
nb["cells"][32]["source"] = new_c32

with open(NOTEBOOK_PATH, "w", encoding="utf-8") as f:
    json.dump(nb, f, indent=1, ensure_ascii=False)

print("Notebook patched successfully!")

# Verify
for idx, label in [(12, "Cell 12"), (13, "Cell 13"), (27, "Cell 27"), (32, "Cell 32")]:
    src = "".join(nb["cells"][idx]["source"])
    has_region = "region" in src
    print(f"  {label}: contains 'region'? {has_region}")
    if idx == 12:
        print(f"    -> {'19' in src and 'region-agnostic' in src}")
