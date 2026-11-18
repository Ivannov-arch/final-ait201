import json
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INVENTORY_MASTER_PATH = ROOT / "data" / "processed" / "inventory_master.csv"
INVENTORY_MASTER_JSON = ROOT / "data" / "processed" / "inventory_master.json"


RISK_TIER_MAP = {"HIGH": "high", "MODERATE": "med", "LOW": "low"}
RISK_LABEL_MAP = {"HIGH": "High Risk", "MODERATE": "Moderate Risk", "LOW": "Low Risk"}


def _ml_risk(record: dict) -> dict | None:
    """Run Person 1's XGBoost spoilage model for one inventory record.

    Returns the prediction dict, or None when the model is unavailable
    (missing dependency / pkl) — callers then fall back to the DTE heuristic.
    Shelf-stable dry goods (Grains & Pulses, Oils & Fats, etc.) are scored by
    the shelf-stable policy inside predict_spoilage_risk, not by the model.
    """
    try:
        from src.ml.spoilage import predict_spoilage_risk, _calendar_features
        dte = float(record.get("days_to_expiry", 5) or 5)
        dow, weekend, month = _calendar_features(record)
        return predict_spoilage_risk({
            "days_until_expiry": dte,
            "shelf_life_days": float(record.get("shelf_life_days") or max(1, dte + 7)),
            "initial_quantity": float(record.get("quantity", 0) or 0),
            "base_price": float(record.get("unit_price_myr", 5.0) or 5.0),
            "daily_demand": max(1.0, float(record.get("reorder_quantity", 10) or 10) / 7),
            "stock_pressure": float(record.get("stock_pressure") or 1.0),
            # ISSUE-06: calendar features + promo flag now sent with every call
            "day_of_week": dow,
            "is_weekend": weekend,
            "month": month,
            "is_promoted": int(record.get("is_promoted") or 0),
            "category": str(record.get("category") or "Produce"),
        })
    except Exception:
        return None


def predict_live_spoilage(batch_data: dict) -> dict:
    from datetime import date, datetime
    try:
        from src.ml.spoilage import predict_spoilage_risk, _calendar_features
        today = date.today()
        exp_str = str(batch_data.get("expiryDate") or batch_data.get("expiry_date") or "")
        in_str = str(batch_data.get("dateIn") or batch_data.get("date_received") or "")
        
        dte = 7
        if exp_str:
            try:
                exp_dt = datetime.strptime(exp_str[:10], "%Y-%m-%d").date()
                dte = max(0, (exp_dt - today).days)
            except Exception:
                pass
                
        shelf_life = dte + 7
        if exp_str and in_str:
            try:
                exp_dt = datetime.strptime(exp_str[:10], "%Y-%m-%d").date()
                in_dt = datetime.strptime(in_str[:10], "%Y-%m-%d").date()
                shelf_life = max(1, (exp_dt - in_dt).days)
            except Exception:
                pass
                
        qty = float(batch_data.get("stockQty") or batch_data.get("quantity") or 5)
        price = float(batch_data.get("unitPrice") or batch_data.get("unit_price_myr") or 2.5)
        rl = float(batch_data.get("reorderLevel") or batch_data.get("reorder_level") or 20)
        rq = max(rl, round(qty * 0.8))
        daily_demand = max(1.0, rq / 7.0)
        stock_pressure = round(qty / (rl + 1.0), 2)
        
        category = str(batch_data.get("category") or "Produce")
        is_promoted = int(bool(batch_data.get("isPromoted") or batch_data.get("is_promoted") or False))
        
        dow, weekend, month = _calendar_features({"date_received": in_str or today.isoformat()})
        
        lot = {
            "days_until_expiry": dte,
            "shelf_life_days": shelf_life,
            "initial_quantity": qty,
            "base_price": price,
            "daily_demand": daily_demand,
            "stock_pressure": stock_pressure,
            "day_of_week": dow,
            "is_weekend": weekend,
            "month": month,
            "is_promoted": is_promoted,
            "category": category
        }
        pred = predict_spoilage_risk(lot)
        label = pred.get("label", "LOW")
        score = pred.get("score")
        risk_map = {"HIGH": ("high", "High Risk"), "MODERATE": ("med", "Moderate Risk"), "LOW": ("low", "Low Risk")}
        tier, label_display = risk_map.get(label, ("low", "Low Risk"))
        return {
            "ok": True,
            "dte": "1 day" if dte == 1 else f"{dte} days",
            "dteNum": dte,
            "risk": label_display,
            "riskType": tier,
            "score": score,
            "raw_label": pred.get("raw_label"),
            "probabilities": pred.get("probabilities"),
            "source": "ml_xgboost"
        }
    except Exception as e:
        dte = int(batch_data.get("dteNum") or 5)
        tier = "high" if dte <= 2 else "med" if dte <= 5 else "low"
        label = "High Risk" if dte <= 2 else "Moderate Risk" if dte <= 5 else "Low Risk"
        return {
            "ok": True,
            "dte": f"{dte} days",
            "dteNum": dte,
            "risk": label,
            "riskType": tier,
            "score": None,
            "source": "heuristic_dte",
            "error": str(e)
        }


def _format_batch_record(record: dict) -> dict:
    """Format an inventory record dict into the standardized batch response shape."""
    exp_str = str(record.get("expiry_date") or record.get("expiryDate") or "")
    dte = 5
    if exp_str:
        try:
            from datetime import date, datetime
            if "T" in exp_str:
                exp_dt = datetime.fromisoformat(exp_str.split("T")[0]).date()
            else:
                exp_dt = datetime.strptime(exp_str[:10], "%Y-%m-%d").date()
            dte = (exp_dt - date.today()).days
        except Exception:
            try:
                dte = int(record.get("days_to_expiry", 5))
            except (ValueError, TypeError):
                dte = 5
    else:
        try:
            dte = int(record.get("days_to_expiry", 5))
        except (ValueError, TypeError):
            dte = 5

    if dte < 0:
        status = "Expired"
        risk_tier = "expired"
        risk_label = "Expired"
        risk_score = None
        risk_source = "calendar_expired"
    else:
        status = "Near Expiry" if dte <= 2 else "Available"

        # Risk priority: Person 1's XGBoost model (or shelf-stable policy) →
        # stored risk_label → DTE heuristic.
        pred = _ml_risk(record)
        if pred and pred.get("label"):
            lbl = str(pred["label"]).upper()
            risk_tier = RISK_TIER_MAP.get(lbl, "low")
            risk_label = RISK_LABEL_MAP.get(lbl, "Low Risk")
            risk_score = pred.get("score")
            risk_source = pred.get("source", "ml_xgboost")
        else:
            risk_tier = str(record.get("risk_tier") or ("high" if dte <= 2 else "med" if dte <= 5 else "low")).lower()
            risk_label = str(record.get("risk_label") or ("High Risk" if dte <= 2 else "Moderate Risk" if dte <= 5 else "Low Risk"))
            risk_score = None
            risk_source = "dte_fallback"

    qty = float(record.get("quantity", 0.0) or 0.0)
    price = float(record.get("unit_price_myr", 5.0) or 5.0)
    cost = float(record.get("cost_price_myr", price * 0.70) or (price * 0.70))
    uom = str(record.get("uom", "units") or "units")
    prod_name = str(record.get("product_name", record.get("food_name", "Unknown")))
    lot_id = str(record.get("lot_id", record.get("batch_id", "N/A")))
    date_in = str(record.get("date_received", record.get("dateIn", "")))
    expiry = str(record.get("expiry_date", record.get("expiryDate", "")))
    reorder = int(record.get("reorder_level", 15) or 15)
    reorder_qty = int(record.get("reorder_quantity", 20) or 20)
    is_promo = int(record.get("is_promoted", record.get("isPromoted", 0)) or 0)
    turnover = float(record.get("turnover_ratio", 2.0) or 2.0)
    pressure = float(record.get("stock_pressure", 1.0) or 1.0)

    return {
        "batch_id": lot_id,
        "food_name": prod_name,
        "quantity": qty,
        "unit": uom,
        "status": status,
        "category": str(record.get("category", "Produce")),
        "unit_price_myr": price,
        "days_to_expiry": dte,
        "risk_tier": risk_tier,
        "risk_label": risk_label,
        "risk_score": risk_score,
        "risk_source": risk_source,
        "shelf_life_days": float(record.get("shelf_life_days") or max(1, dte + 7)),
        "turnover_ratio": turnover,
        "stock_pressure": pressure,
        # Frontend-compatible aliases
        "id": lot_id,
        "product": prod_name,
        "stockQty": qty,
        "qty": f"{qty} {uom}",
        "uom": uom,
        "sellPrice": f"RM {price:.2f}/{uom}",
        "costPrice": f"RM {cost:.2f}/{uom}",
        "unitPrice": price,
        "expiryDate": expiry,
        "dateIn": date_in,
        "dteNum": dte,
        "dte": "1 day" if dte == 1 else f"{dte} days",
        "risk": risk_label,
        "riskType": risk_tier,
        "reorderLevel": reorder,
        "reorderQuantity": reorder_qty,
        "isPromoted": is_promo,
        "supplier": str(record.get("supplier_name", record.get("supplier", "Direct Procurement")))
    }


def get_batch_by_id(batch_id: str) -> dict | None:
    """Retrieve a single batch record by lot_id."""
    if INVENTORY_MASTER_JSON.exists():
        try:
            with open(INVENTORY_MASTER_JSON, "r", encoding="utf-8") as f:
                records = json.load(f)
            for r in records:
                if str(r.get("lot_id")) == str(batch_id):
                    return _format_batch_record(r)
        except Exception:
            pass

    if INVENTORY_MASTER_PATH.exists():
        try:
            df = pd.read_csv(INVENTORY_MASTER_PATH)
            matches = df[df["lot_id"] == batch_id]
            if not matches.empty:
                return _format_batch_record(matches.iloc[0].to_dict())
        except Exception:
            pass

    return None


def get_batches():
    # Prefer reading json if available, with csv fallback
    if INVENTORY_MASTER_JSON.exists():
        try:
            with open(INVENTORY_MASTER_JSON, "r", encoding="utf-8") as f:
                records = json.load(f)
            batches = [_format_batch_record(row) for row in records[:100]]
            return {
                "status": "success",
                "is_mock_data": False,
                "total_batches": len(batches),
                "batches": batches
            }
        except Exception:
            pass

    if not INVENTORY_MASTER_PATH.exists():
        return {
            "status": "error",
            "message": "inventory_master.csv not found",
            "total_batches": 0,
            "batches": []
        }

    df = pd.read_csv(INVENTORY_MASTER_PATH)
    batches = [_format_batch_record(row) for row in df.head(100).to_dict(orient="records")]

    return {
        "status": "success",
        "is_mock_data": False,
        "total_batches": len(batches),
        "batches": batches
    }


def save_batch_to_csv(batch_data: dict):
    lot_id = str(batch_data.get("id") or f"LOT-{1000}")
    product = str(batch_data.get("product") or "Unknown")
    category = str(batch_data.get("category") or "Produce")
    quantity = float(batch_data.get("stockQty") or 25.0)
    unit_price = float(batch_data.get("unitPrice") or 8.5)
    cost_price = round(unit_price * 0.70, 2)
    dte = int(batch_data.get("dteNum") or 5)
    reorder = int(batch_data.get("reorderLevel") or 15)
    turnover = float(batch_data.get("turnoverRatio") or 2.2)
    expiry = str(batch_data.get("expiryDate") or "2026-11-20")
    date_in = str(batch_data.get("dateIn") or "2026-11-14")
    uom = str(batch_data.get("unit") or ("kg" if category in ["Produce", "Seafood"] else "pack"))

    # ML-powered Spoilage Risk Prediction (Person 1 Model Integration)
    try:
        from src.ml.spoilage import predict_spoilage_risk, _calendar_features
        dow, weekend, month = _calendar_features({"date_received": date_in})
        lot_feature_input = {
            "days_until_expiry": dte,
            "shelf_life_days": max(1, dte + 7),
            "Stock_Quantity": quantity,
            "Sales_Volume": turnover,
            "Unit_Price": unit_price,
            "Category": category,
            "turnover_ratio": turnover,
            "stock_pressure": round(quantity / (reorder + 1), 2),
            # ISSUE-06: full 19-feature schema (calendar + promotion)
            "day_of_week": dow,
            "is_weekend": weekend,
            "month": month,
            "is_promoted": int(batch_data.get("isPromoted") or batch_data.get("is_promoted") or 0),
        }
        pred = predict_spoilage_risk(lot_feature_input)
        raw_label = str(pred.get("label", "LOW")).upper()
        if raw_label == "HIGH":
            risk_tier = "high"
            risk_label = "High Risk"
        elif raw_label == "MODERATE":
            risk_tier = "med"
            risk_label = "Moderate Risk"
        else:
            risk_tier = "low"
            risk_label = "Low Risk"
    except Exception:
        # Fallback heuristic
        risk_tier = "high" if dte <= 2 else "med" if dte <= 5 else "low"
        risk_label = "High Risk" if dte <= 2 else "Moderate Risk" if dte <= 5 else "Low Risk"

    new_row = {
        "lot_id": lot_id,
        "product_name": product,
        "category": category,
        "quantity": quantity,
        "uom": uom,
        "unit_price_myr": f"{unit_price:.2f}",
        "cost_price_myr": f"{cost_price:.2f}",
        "expiry_date": expiry,
        "days_to_expiry": dte,
        "shelf_life_days": max(1, dte + 7),
        "date_received": date_in,
        "is_promoted": int(batch_data.get("isPromoted") or batch_data.get("is_promoted") or 0),
        "reorder_level": reorder,
        "reorder_quantity": max(15, int(quantity * 0.8)),
        "turnover_ratio": f"{turnover:.2f}",
        "stock_pressure": f"{round(quantity / (reorder + 1), 2):.2f}",
        "risk_tier": risk_tier,
        "risk_label": risk_label,
        "supplier_name": str(batch_data.get("supplier") or "Direct Procurement"),
        "warehouse_location": str(batch_data.get("warehouseLocation") or "Aisle 1 - General Display"),
        "store_id": "MY-KL-001",
        "status": "Active"
    }

    # 1. Update JSON master
    try:
        records = []
        if INVENTORY_MASTER_JSON.exists():
            with open(INVENTORY_MASTER_JSON, "r", encoding="utf-8") as f:
                records = json.load(f)
        # Upsert
        found = False
        for i, r in enumerate(records):
            if r.get("lot_id") == lot_id:
                records[i] = new_row
                found = True
                break
        if not found:
            records.insert(0, new_row)
        with open(INVENTORY_MASTER_JSON, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=2)
    except Exception:
        pass

    # 2. Update CSV master (handles case if CSV is open in Excel)
    csv_saved = False
    try:
        df = pd.read_csv(INVENTORY_MASTER_PATH)
        if lot_id in df["lot_id"].values:
            idx = df.index[df["lot_id"] == lot_id][0]
            for k, v in new_row.items():
                df.at[idx, k] = v
        else:
            new_df = pd.DataFrame([new_row])
            df = pd.concat([new_df, df], ignore_index=True)
        df.to_csv(INVENTORY_MASTER_PATH, index=False)
        csv_saved = True
    except PermissionError:
        # File is locked in Excel, stored in JSON master
        pass
    except Exception:
        pass

    return {
        "status": "success",
        "message": f"Batch {lot_id} successfully persisted to master inventory",
        "csv_updated": csv_saved,
        "batch": new_row
    }


def update_batch(batch_id: str, updates: dict) -> dict | None:
    """Updates an existing batch in inventory_master.json and CSV."""
    records = []
    if INVENTORY_MASTER_JSON.exists():
        try:
            with open(INVENTORY_MASTER_JSON, "r", encoding="utf-8") as f:
                records = json.load(f)
        except Exception:
            records = []

    idx = next((i for i, r in enumerate(records) if str(r.get("lot_id")) == str(batch_id)), -1)
    if idx < 0:
        return None

    # Map payload fields
    target = records[idx]
    if "quantity" in updates:
        target["quantity"] = float(updates["quantity"])
    if "stockQty" in updates:
        target["quantity"] = float(updates["stockQty"])
    if "unit_price_myr" in updates or "unitPrice" in updates or "sellPrice" in updates:
        p = updates.get("unit_price_myr") or updates.get("unitPrice") or updates.get("sellPrice")
        try:
            val = float(str(p).replace("RM", "").replace("/kg", "").replace("/unit", "").strip())
            target["unit_price_myr"] = f"{val:.2f}"
        except Exception:
            pass
    if "expiry_date" in updates or "expiryDate" in updates:
        target["expiry_date"] = updates.get("expiry_date") or updates.get("expiryDate")
    if "days_to_expiry" in updates or "dteNum" in updates:
        target["days_to_expiry"] = int(updates.get("days_to_expiry") or updates.get("dteNum") or 5)
    if "reorder_level" in updates or "reorderLevel" in updates:
        target["reorder_level"] = int(updates.get("reorder_level") or updates.get("reorderLevel") or 15)
    if "product_name" in updates or "product" in updates:
        target["product_name"] = updates.get("product_name") or updates.get("product")
    if "category" in updates:
        target["category"] = updates.get("category")
    if "status" in updates:
        target["status"] = updates.get("status")

    # If quantity <= 0, remove
    if float(target.get("quantity", 0)) <= 0:
        records.pop(idx)
        with open(INVENTORY_MASTER_JSON, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=2)
        return {"status": "deleted", "lot_id": batch_id}

    with open(INVENTORY_MASTER_JSON, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)

    return {"status": "updated", "lot_id": batch_id, "batch": _format_batch_record(target)}


def delete_batch(batch_id: str) -> dict | None:
    """Deletes a batch by ID from inventory_master.json."""
    if not INVENTORY_MASTER_JSON.exists():
        return None
    try:
        with open(INVENTORY_MASTER_JSON, "r", encoding="utf-8") as f:
            records = json.load(f)
        before = len(records)
        records = [r for r in records if str(r.get("lot_id")) != str(batch_id)]
        if len(records) == before:
            return None
        with open(INVENTORY_MASTER_JSON, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=2)
        return {"status": "deleted", "lot_id": batch_id}
    except Exception:
        return None


def predict_live_spoilage(batch_data: dict) -> dict:
    """Computes live ML spoilage risk on arbitrary form data (Add/Edit modals)."""
    from datetime import date, datetime
    today = date.today()

    exp_str = batch_data.get("expiryDate") or batch_data.get("expiry_date")
    in_str = batch_data.get("dateIn") or batch_data.get("date_received")

    def parse_d(s):
        if not s:
            return None
        s = str(s).strip()
        for fmt in ("%Y-%m-%d", "%b %d, %Y", "%B %d, %Y"):
            try:
                return datetime.strptime(s, fmt).date()
            except ValueError:
                pass
        return None

    exp_d = parse_d(exp_str)
    in_d = parse_d(in_str) or today

    if exp_d:
        if in_d > today:
            dte = max(0, (exp_d - in_d).days)
        else:
            dte = max(0, (exp_d - today).days)
        shelf_life = max(1, (exp_d - in_d).days)
    else:
        dte = int(batch_data.get("days_to_expiry") or batch_data.get("dteNum") or 7)
        shelf_life = max(1, dte + 7)

    qty = float(batch_data.get("stockQty") or batch_data.get("quantity") or 10)
    price = float(batch_data.get("unitPrice") or batch_data.get("unit_price_myr") or 5.0)
    reorder = float(batch_data.get("reorderLevel") or batch_data.get("reorder_level") or 15)
    rq = max(reorder, round(qty * 0.8))
    turnover = float(batch_data.get("turnoverRatio") or batch_data.get("turnover_ratio") or round(qty / max(1.0, rq), 2))
    is_promoted = int(bool(batch_data.get("isPromoted") or batch_data.get("is_promoted") or False))
    category = str(batch_data.get("category") or "Produce")

    pred = None
    try:
        from src.ml.spoilage import predict_spoilage_risk, _calendar_features
        dow, weekend, month = _calendar_features({"date_received": in_d.strftime("%Y-%m-%d")})
        lot_input = {
            "days_until_expiry": dte,
            "shelf_life_days": shelf_life,
            "initial_quantity": qty,
            "base_price": price,
            "daily_demand": max(1.0, rq / 7.0),
            "stock_pressure": round(qty / (reorder + 1), 2),
            "day_of_week": dow,
            "is_weekend": weekend,
            "month": month,
            "is_promoted": is_promoted,
            "category": category,
            "turnover_ratio": turnover
        }
        pred = predict_spoilage_risk(lot_input)
    except Exception:
        pass

    raw_label = (pred.get("label") if pred else None) or ("HIGH" if dte <= 2 else "MODERATE" if dte <= 5 else "LOW")
    risk_tier = RISK_TIER_MAP.get(raw_label.upper(), "low")
    risk_label = RISK_LABEL_MAP.get(raw_label.upper(), "Low Risk")
    score = pred.get("score") if pred else (0.90 if dte <= 2 else 0.75 if dte <= 5 else 0.95)

    return {
        "ok": True,
        "dte": f"{dte} days" if dte != 1 else "1 day",
        "dteNum": dte,
        "shelf_life_days": shelf_life,
        "risk": risk_label,
        "riskType": risk_tier,
        "score": score,
        "raw_label": raw_label,
        "probabilities": pred.get("probabilities") if pred else None,
        "source": "ml_xgboost" if pred else "heuristic_dte"
    }

