import json
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INVENTORY_MASTER_PATH = ROOT / "data" / "processed" / "inventory_master.csv"
INVENTORY_MASTER_JSON = ROOT / "data" / "processed" / "inventory_master.json"


def _format_batch_record(record: dict) -> dict:
    """Format an inventory record dict into the standardized batch response shape."""
    try:
        dte = int(record.get("days_to_expiry", 5))
    except (ValueError, TypeError):
        dte = 5
    status = "Near Expiry" if dte <= 2 else "Available"
    
    # Extract or infer risk tier and label
    risk_tier = str(record.get("risk_tier") or ("high" if dte <= 2 else "med" if dte <= 5 else "low")).lower()
    risk_label = str(record.get("risk_label") or ("High Risk" if dte <= 2 else "Moderate Risk" if dte <= 5 else "Low Risk"))

    return {
        "batch_id": str(record.get("lot_id", "N/A")),
        "food_name": str(record.get("product_name", "Unknown")),
        "quantity": float(record.get("quantity", 0.0)),
        "unit": str(record.get("uom", "units")),
        "status": status,
        "category": str(record.get("category", "Produce")),
        "unit_price_myr": float(record.get("unit_price_myr", 5.0)),
        "days_to_expiry": dte,
        "risk_tier": risk_tier,
        "risk_label": risk_label,
        "shelf_life_days": float(record.get("shelf_life_days") or max(1, dte + 7)),
        "turnover_ratio": float(record.get("turnover_ratio") or 2.0),
        "stock_pressure": float(record.get("stock_pressure") or 1.0)
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
        from src.ml.spoilage import predict_spoilage_risk
        lot_feature_input = {
            "days_until_expiry": dte,
            "shelf_life_days": max(1, dte + 7),
            "Stock_Quantity": quantity,
            "Sales_Volume": turnover,
            "Unit_Price": unit_price,
            "Category": category,
            "turnover_ratio": turnover,
            "stock_pressure": round(quantity / (reorder + 1), 2)
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
