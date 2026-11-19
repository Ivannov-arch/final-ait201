import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from datetime import date, timedelta

from src.ml.spoilage import predict_spoilage_risk

CATEGORIES = ["Fruits & Vegetables", "Dairy", "Bakery", "Beverages", "Seafood", "Meat"]

TODAY = date.today()   # DTE dihitung dari hari ini, sama seperti frontend

# ── Batch ID counter ──────────────────────────────────────────────────────────
_batch_counter = 1055

def next_batch_id() -> str:
    global _batch_counter
    bid = f"LOT-{_batch_counter}"
    _batch_counter += 1
    return bid

# ── Feature builder (mirrors batchToRow / rowToSpoilageLot in the frontend) ───
def lot(category, qty, price, reorder_level, shelf_life_days, date_in, expiry_date, is_promoted):
    """
    shelf_life_days = expiry_date - date_in  (total umur produk, dipakai model)
    days_until_expiry = expiry_date - TODAY  (DTE yg ditampilkan form & dipakai model)
    """
    reorder_quantity  = max(reorder_level, round(qty * 0.8))
    daily_demand      = max(1.0, reorder_quantity / 7)
    stock_pressure    = qty / (reorder_level + 1)

    y, m, d = map(int, date_in.split("-"))
    dt  = date(y, m, d)
    dow = dt.weekday()

    ey, em, ed = map(int, expiry_date.split("-"))
    exp_dt = date(ey, em, ed)
    days_until_expiry = max(0, (exp_dt - TODAY).days)

    return {
        "days_until_expiry": days_until_expiry,   # expiry − today  (sama dg form)
        "shelf_life_days":   shelf_life_days,      # expiry − date_in
        "initial_quantity":  qty,
        "base_price":        price,
        "daily_demand":      daily_demand,
        "stock_pressure":    round(stock_pressure, 2),
        "day_of_week":       dow,
        "is_weekend":        1 if dow >= 5 else 0,
        "month":             m,
        "is_promoted":       is_promoted,
        "category":          category,
    }

# ── Grid search: find configs where risk label flips on is_promoted ───────────
# date_in pilihan: tanggal yg sudah lewat/hari ini supaya DTE (expiry-today) realistis
DATE_INS = ["2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18"]

hits = []
for category in CATEGORIES:
    for qty in [5, 10, 15, 20, 30, 40, 50, 80, 120, 200]:
        for price in [2.5, 5.0, 8.5, 15.0, 30.0]:
            for rl in [5, 10, 15, 20, 30]:
                for shelf_life in [3, 5, 7, 10, 14, 21, 30]:
                    for date_in_str in DATE_INS:
                        date_in_d = date(*map(int, date_in_str.split("-")))
                        expiry_d  = date_in_d + timedelta(days=shelf_life)

                        # Skip kalau expiry sudah lewat
                        if expiry_d <= TODAY:
                            continue

                        expiry_str = expiry_d.strftime("%Y-%m-%d")
                        rq       = max(rl, round(qty * 0.8))
                        turnover = round(qty / max(1, rq), 2)

                        base = dict(
                            category=category, qty=qty, price=price,
                            reorder_level=rl, shelf_life_days=shelf_life,
                            date_in=date_in_str, expiry_date=expiry_str,
                        )
                        p0 = predict_spoilage_risk(lot(**base, is_promoted=0))
                        p1 = predict_spoilage_risk(lot(**base, is_promoted=1))

                        if p0["label"] != p1["label"]:
                            hits.append((base, p0, p1, expiry_d, rq, turnover))
                            if len(hits) >= 25:
                                break
                    if len(hits) >= 25: break
                if len(hits) >= 25: break
            if len(hits) >= 25: break
        if len(hits) >= 25: break
    if len(hits) >= 25: break

# ── Display results ───────────────────────────────────────────────────────────
RISK_ICON = {"HIGH": "🔴", "MODERATE": "🟡", "LOW": "🟢"}

print("=" * 72)
print(f"  FOUND {len(hits)} config(s) where risk label flips on ON PROMOTION toggle")
print(f"  (DTE dihitung dari today={TODAY} ke expiry, sama seperti form)")
print("=" * 72)

if not hits:
    print("NO label flip found in the search grid.")
else:
    for idx, (base, p0, p1, expiry_d, rq, turnover) in enumerate(hits[:25], 1):
        date_in_d = date(*map(int, base["date_in"].split("-")))
        dte_today = (expiry_d - TODAY).days   # DTE yg akan muncul di form

        icon0 = RISK_ICON.get(p0["label"], "⬜")
        icon1 = RISK_ICON.get(p1["label"], "⬜")
        batch_id = next_batch_id()

        print(f"\n── Config #{idx} ──────────────────────────────────────────────────")
        print(f"  BATCH ID          : {batch_id}")
        print(f"  CATEGORY          : {base['category']}")
        print(f"  UNIT PRICE (RM)   : {base['price']}")
        print(f"  STOCK QTY (units) : {base['qty']}")
        print(f"  REORDER LEVEL     : {rl}")
        print(f"  TURNOVER RATIO    : {turnover}")
        print(f"  DATE IN           : {base['date_in']}")
        print(f"  EXPIRY DATE       : {expiry_d.strftime('%Y-%m-%d')}  (DTE form={dte_today} days, shelf_life={base['shelf_life_days']} days)")
        print(f"  ┌─ ON PROMOTION unchecked → {icon0} {p0['label']:8s} (score={p0['score']:.4f})")
        print(f"  └─ ON PROMOTION checked   → {icon1} {p1['label']:8s} (score={p1['score']:.4f})")

    print()
    print("=" * 72)
    print("  Paste config ke form → DTE di preview = DTE form di atas.")
    print("  Centang/uncentang 'On Promotion' → risk badge berubah.")
    print("=" * 72)