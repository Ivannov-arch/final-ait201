"""
Spoilage ML Bridge — persistent stdin/stdout JSON process for the Node/Vite API.
================================================================================

The frontend runtime is the Vite middleware (frontend/vite.config.js), which is
Node.js and cannot load the XGBoost .pkl directly. This bridge keeps a single
long-lived Python process alive so the model loads ONCE and every batch
prediction costs only milliseconds.

Protocol (one JSON message per line):
  in:  {"lots": [{...lot dict...}, ...]}
  out: {"ok": true, "results": [{label, score, ...}, ...]}

On startup it emits:  {"event": "ready"}
On fatal import error it emits:  {"ok": false, "error": "..."} and exits.

Usage (standalone smoke test):
    echo {"lots":[{"days_until_expiry":1,"category":"Dairy"}]} | python src/ml/spoilage_bridge.py
"""

import sys
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

try:
    from src.ml.spoilage import predict_spoilage_risk
    from src.ml.dispatch_estimator import estimate_dispatch_cargo
except Exception as e:  # missing joblib/xgboost/sklearn etc.
    print(json.dumps({"ok": False, "error": f"import_failed: {e}"}), flush=True)
    sys.exit(1)

print(json.dumps({"event": "ready"}), flush=True)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        msg = json.loads(line)
        lots = msg.get("lots", [])
        results = []
        for lot in lots:
            pred = predict_spoilage_risk(lot)
            try:
                cargo = estimate_dispatch_cargo(lot)
                pred["cargo_specs"] = cargo
            except Exception:
                pred["cargo_specs"] = None
            results.append(pred)
        print(json.dumps({"ok": True, "results": results}), flush=True)
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}), flush=True)
