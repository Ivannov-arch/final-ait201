"""Multi-Dataset Canonical Schema Harmonization Module (Person 3 - Goal 3).

Harmonizes heterogeneous datasets into a unified canonical batch schema:
`canonical_batch_table.csv`.
"""

from __future__ import annotations

import csv
from datetime import datetime, timedelta
import os
import re
from typing import Any

LOTS_BASE_PATH = os.path.join("data", "processed", "lots_base.csv")
PERISHABLE_PATH = os.path.join("data", "raw", "7. perishable_goods_management.csv")
OUTPUT_CANONICAL_PATH = os.path.join("data", "processed", "canonical_batch_table.csv")
OUTPUT_MIRROR_PATH = os.path.join("output", "canonical_batch_table.csv")

ANCHOR_DATE = datetime(2026, 10, 30)

STORE_NETWORK = [
    "MY-KL-001",   # Bukit Bintang Flagship
    "MY-KL-002",   # Cheras Leisure Mall
    "MY-SGR-001",  # Subang Jaya Empire
    "MY-SGR-002",  # Petaling Jaya SS2
]

# Canonical Category Taxonomy Mapping Dictionary
CATEGORY_MAPPING = {
    # Produce
    "produce": "Produce",
    "fruits & vegetables": "Produce",
    "vegetables": "Produce",
    "fruits": "Produce",
    # Dairy
    "dairy": "Dairy",
    "dairy & eggs": "Dairy",
    "eggs": "Dairy",
    # Meat
    "meat & poultry": "Meat",
    "meat": "Meat",
    "poultry": "Meat",
    "seafood": "Meat",
    # Bakery
    "bakery": "Bakery",
    "bakery & bread": "Bakery",
    "bread": "Bakery",
    # Pantry
    "canned goods": "Pantry",
    "grains": "Pantry",
    "oils & fats": "Pantry",
    "dry goods": "Pantry",
    "prepared food": "Pantry",
    # Beverages
    "beverages": "Beverages",
    "juices": "Beverages",
}


def map_to_canonical_category(raw_cat: str) -> str:
    """Maps any raw category string to standard 6 canonical categories."""
    if not raw_cat:
        return "Pantry"
    cleaned = raw_cat.strip().lower()
    return CATEGORY_MAPPING.get(cleaned, "Pantry")


def determine_uom(category: str) -> str:
    """Assigns standard Unit of Measure based on canonical category."""
    if category in ("Produce", "Meat"):
        return "kg"
    return "unit"


def build_canonical_batch_table(
    lots_base_path: str = LOTS_BASE_PATH,
    output_path: str = OUTPUT_CANONICAL_PATH,
    mirror_path: str = OUTPUT_MIRROR_PATH,
    anchor_date: datetime = ANCHOR_DATE,
) -> list[dict[str, Any]]:
    """Builds and harmonizes the canonical batch table."""
    if not os.path.exists(lots_base_path):
        raise FileNotFoundError(f"Base lots dataset not found at: {lots_base_path}")

    print(f"[CANONICAL] Ingesting base lots from: {lots_base_path}")
    base_lots = []
    with open(lots_base_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            base_lots.append(r)

    canonical_records = []
    
    # Process base lots into multi-store network
    for idx, r in enumerate(base_lots):
        # Distribute batches realistically across store network
        store_id = STORE_NETWORK[idx % len(STORE_NETWORK)]
        raw_cat = r.get("category", "")
        canon_cat = map_to_canonical_category(raw_cat)
        uom = determine_uom(canon_cat)

        try:
            qty = float(r.get("quantity", 10))
        except ValueError:
            qty = 10.0

        try:
            unit_price = float(r.get("unit_price_myr", 5.0))
        except ValueError:
            unit_price = 5.0

        dte = int(r.get("days_to_expiry", 7))
        shelf_life = int(r.get("shelf_life_days", 14))

        # Initial baseline heuristic predictions before upstream ML
        # (Person 2 & Person 5 fill these via API)
        demand_forecast_3d = round(qty * 0.75 + (idx % 5), 1)
        waste_risk_score = round(max(0.05, min(0.95, (1.0 - (dte / 12.0)))), 3)
        risk_label = "HIGH" if dte <= 2 else ("MODERATE" if dte <= 5 else "LOW")

        canon_row = {
            "batch_id": f"CAN-{2000 + idx}",
            "product_id": f"SKU-{r.get('lot_id', idx)}",
            "product_name": r.get("product_name", f"Item {idx}"),
            "canonical_category": canon_cat,
            "quantity": f"{qty:.1f}",
            "uom": uom,
            "expiry_date": r.get("expiry_date", (anchor_date + timedelta(days=dte)).strftime("%Y-%m-%d")),
            "unit_price_myr": f"{unit_price:.2f}",
            "store_id": store_id,
            "date_received": r.get("date_received", anchor_date.strftime("%Y-%m-%d")),
            "shelf_life_days": shelf_life,
            "days_to_expiry": dte,
            "turnover_ratio": r.get("turnover_ratio", "1.00"),
            "stock_pressure": r.get("stock_pressure", "1.00"),
            "demand_forecast_3d": f"{demand_forecast_3d:.1f}",
            "waste_risk_score": f"{waste_risk_score:.3f}",
            "risk_label": risk_label,
        }
        canonical_records.append(canon_row)

    # Save to both target locations
    fieldnames = list(canonical_records[0].keys())
    for target in (output_path, mirror_path):
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(canonical_records)
        print(f"[CANONICAL] Exported {len(canonical_records)} canonical batches to: {target}")

    return canonical_records


if __name__ == "__main__":
    build_canonical_batch_table()

