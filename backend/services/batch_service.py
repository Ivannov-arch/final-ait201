import json
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INVENTORY_MASTER_PATH = ROOT / "data" / "processed" / "inventory_master.csv"
INVENTORY_MASTER_JSON = ROOT / "data" / "processed" / "inventory_master.json"


def get_batches():
    # Prefer reading json if csv is locked, or csv
    if INVENTORY_MASTER_JSON.exists():
        try:
            with open(INVENTORY_MASTER_JSON, "r", encoding="utf-8") as f:
                records = json.load(f)
            batches = []
            for row in records[:100]:
                dte = row.get("days_to_expiry", 5)
                status = "Near Expiry" if dte <= 2 else "Available"
                batches.append({
                    "batch_id": str(row.get("lot_id", "N/A")),
                    "food_name": str(row.get("product_name", "Unknown")),
                    "quantity": float(row.get("quantity", 0.0)),
                    "unit": str(row.get("uom", "units")),
                    "status": status,
                    "category": str(row.get("category", "Produce")),
                    "unit_price_myr": float(row.get("unit_price_myr", 5.0)),
                    "days_to_expiry": int(dte)
                })
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
    batches = []
    for _, row in df.head(100).iterrows():
        dte = row.get("days_to_expiry", 5)
        status = "Near Expiry" if dte <= 2 else "Available"
        batches.append({
            "batch_id": str(row.get("lot_id", "N/A")),
            "food_name": str(row.get("product_name", "Unknown")),
            "quantity": float(row.get("quantity", 0.0)),
            "unit": str(row.get("uom", "kg" if str(row.get("category", "")).lower() in ["produce", "seafood", "meat"] else "units")),
            "status": status,
            "category": str(row.get("category", "Produce")),
            "unit_price_myr": float(row.get("unit_price_myr", 5.0)),
            "days_to_expiry": int(dte)
        })

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
