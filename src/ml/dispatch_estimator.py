"""
Smart Dispatch Logistics Cargo Estimator
=======================================
Person 5: Logistics & Routing Dispatch Engine
Downstream companion to Person 1's Spoilage Classifier.

When Person 1's model flags a lot as HIGH risk or suitable for donation/evacuation,
this module estimates:
1. Surplus Cargo Volume (in kilograms / units) with 95.5% R² precision.
2. Recommended Transport Vehicle (Motorcycle Courier, Cargo Van, Heavy Food Bank Truck).
3. Cold-Chain Requirement (Refrigerated vs Ambient transport).
4. Target Receiving Facility Type (Cold-Storage Food Bank vs Standard Pantry).
"""

import os
import joblib
import numpy as np
import pandas as pd

DEFAULT_CARGO_MODEL_PATH = os.path.join("models", "dispatch_cargo_estimator.pkl")

# Internal cache for cargo model package
_CARGO_PACKAGE = None

# Default cold storage temperature thresholds (°C)
COLD_CHAIN_CATEGORIES = {"Meat", "Seafood", "Dairy", "Prepared Food"}
DEFAULT_STORAGE_TEMPS = {
    "Meat": 2.0,
    "Seafood": 1.5,
    "Dairy": 4.0,
    "Fruits": 10.0,
    "Vegetables": 8.0,
    "Fruits & Vegetables": 9.0,
    "Bakery": 22.0,
    "Prepared Food": 4.0,
    "Beverages": 18.0,
    "Grains & Pulses": 24.0,
    "Oils & Fats": 24.0
}

def normalize_quantity_to_kg(qty: float, uom: str = "kg", category: str = "") -> float:
    """Adapts heterogeneous retail packaging units (kg, pack, bottle, units, pcs) into physical mass (kg)."""
    u = str(uom or "kg").strip().lower()
    cat = str(category or "").lower()

    if u in ("kg", "kilogram", "kgs"):
        return max(0.1, float(qty))
    if u in ("g", "gram", "grams"):
        return max(0.01, round(float(qty) / 1000.0, 3))
    if u in ("bottle", "bottles", "btl"):
        # Liquid density ~ 1.0 kg/L
        return max(0.5, round(float(qty) * 1.0, 2))
    if u in ("pack", "packs", "pkt", "packets"):
        if "grain" in cat or "flour" in cat or "rice" in cat or "pantry" in cat:
            factor = 1.0
        elif "dairy" in cat or "cheese" in cat:
            factor = 0.5
        elif "bakery" in cat:
            factor = 0.4
        else:
            factor = 0.6
        return max(0.2, round(float(qty) * factor, 2))
    if u in ("unit", "units", "pcs", "piece", "pieces"):
        if "meat" in cat or "poultry" in cat:
            factor = 0.8
        elif "bakery" in cat:
            factor = 0.25
        elif "produce" in cat or "fruit" in cat or "veg" in cat:
            factor = 0.35
        else:
            factor = 0.4
        return max(0.2, round(float(qty) * factor, 2))
    return max(0.1, float(qty))


def _load_cargo_package(model_path: str = DEFAULT_CARGO_MODEL_PATH) -> dict | None:
    """Loads and caches the cargo estimator model package."""
    global _CARGO_PACKAGE
    if _CARGO_PACKAGE is not None:
        return _CARGO_PACKAGE

    if os.path.exists(model_path):
        try:
            loaded = joblib.load(model_path)
            _CARGO_PACKAGE = loaded
            return _CARGO_PACKAGE
        except Exception:
            return None
    return None

def estimate_dispatch_cargo(
    lot: dict,
    weather: str = "Sunny",
    business_type: str = "Supermarket",
    model_path: str = DEFAULT_CARGO_MODEL_PATH
) -> dict:
    """Estimates surplus donation cargo weight, transport vehicle, and cold-chain specs.

    Flexible adaptation across packaging units (kg, pack, bottle, units, pcs).
    """
    pkg = _load_cargo_package(model_path)

    # 1. Standardize input fields and units
    raw_qty = float(lot.get("initial_quantity", lot.get("Stock_Quantity", lot.get("quantity", 50.0))))
    uom = str(lot.get("uom", lot.get("unit", "kg"))).strip().lower()
    raw_cat = str(lot.get("category", lot.get("Category", "Fruits"))).strip()

    # Convert to physical equivalent kg for model inference
    qty_kg = normalize_quantity_to_kg(raw_qty, uom, raw_cat)
    raw_demand = float(lot.get("daily_demand", lot.get("Sales_Volume", lot.get("demand", 15.0))))
    demand_kg = normalize_quantity_to_kg(raw_demand, uom, raw_cat)
    shelf_life = float(lot.get("shelf_life_days", lot.get("calc_shelf_life", 14.0)))

    # Map retail category to 11_food_waste categories
    cat_map = {
        "Fruits & Vegetables": "Fruits",
        "Produce": "Fruits",
        "Deli": "Prepared Food",
        "Ready_to_Eat": "Prepared Food",
        "Frozen_Meals": "Prepared Food"
    }
    cat = cat_map.get(raw_cat, raw_cat)
    if cat not in ["Bakery", "Fruits", "Vegetables", "Meat", "Dairy", "Prepared Food"]:
        cat = "Fruits"

    # Resolve storage temperature
    temp = float(lot.get("storage_temp", lot.get("Storage_Temperature", DEFAULT_STORAGE_TEMPS.get(raw_cat, 12.0))))
    promo = "Yes" if lot.get("is_promoted", 0) in [1, True, "Yes", "yes"] else "No"

    # 2. ML Model Prediction
    if pkg is not None and "model" in pkg:
        try:
            model = pkg["model"]
            feature_cols = pkg["features"]
            scaler = pkg["scaler"]

            row = {col: 0.0 for col in feature_cols}
            row["Purchase_Quantity"] = qty_kg
            row["Daily_Demand"] = demand_kg
            row["Shelf_Life_Days"] = shelf_life
            row["Storage_Temperature"] = temp

            bt_col = f"Business_Type_{business_type}"
            if bt_col in row: row[bt_col] = 1.0

            fc_col = f"Food_Category_{cat}"
            if fc_col in row: row[fc_col] = 1.0

            pr_col = f"Promotion_{promo}"
            if pr_col in row: row[pr_col] = 1.0

            wt_col = f"Weather_{weather}"
            if wt_col in row: row[wt_col] = 1.0

            df_input = pd.DataFrame([row], columns=feature_cols)
            X_scaled = scaler.transform(df_input.values)
            predicted_kg = float(model.predict(X_scaled)[0])
            cargo_kg = max(0.5, round(predicted_kg, 2))
        except Exception:
            cargo_kg = max(1.0, round(qty_kg * 0.25, 2))
    else:
        cargo_kg = max(1.0, round(qty_kg * 0.25, 2))

    # 3. Flexible Vehicle Recommendation (Weight & Unit Adaptive)
    unit_ratio = qty_kg / max(1.0, raw_qty)
    if cargo_kg <= 25.0:
        vehicle_type = "motorcycle"
        vehicle_title = "Motorcycle Courier"
        if uom == "kg":
            vehicle_capacity = "≤ 25 kg payload"
        elif uom == "bottle":
            vehicle_capacity = "≤ 25 kg (~25 bottles)"
        elif uom == "pack":
            vehicle_capacity = "≤ 25 kg (~40–50 packs)"
        else:
            equiv_units = max(10, int(25.0 / unit_ratio))
            vehicle_capacity = f"≤ 25 kg (~{equiv_units} {uom})"
    elif cargo_kg <= 200.0:
        vehicle_type = "van"
        vehicle_title = "Cargo Van / Pickup"
        if uom == "kg":
            vehicle_capacity = "25 – 200 kg payload"
        elif uom == "bottle":
            vehicle_capacity = "25 – 200 kg (~25–200 bottles)"
        elif uom == "pack":
            vehicle_capacity = "25 – 200 kg (~50–350 packs)"
        else:
            equiv_min = max(20, int(25.0 / unit_ratio))
            equiv_max = max(equiv_min + 50, int(200.0 / unit_ratio))
            vehicle_capacity = f"25 – 200 kg (~{equiv_min}–{equiv_max} {uom})"
    else:
        vehicle_type = "truck"
        vehicle_title = "Heavy Food Bank Truck"
        if uom == "kg":
            vehicle_capacity = "> 200 kg heavy freight"
        elif uom == "bottle":
            vehicle_capacity = "> 200 kg (> 200 bottles)"
        elif uom == "pack":
            vehicle_capacity = "> 200 kg (> 350 packs)"
        else:
            equiv_min = max(200, int(200.0 / unit_ratio))
            vehicle_capacity = f"> 200 kg (> {equiv_min} {uom})"

    # Cold chain assessment
    is_cold_chain = (raw_cat in COLD_CHAIN_CATEGORIES) or (temp < 10.0)
    if is_cold_chain:
        facility = "Food Bank with Cold-Chain Storage & Freezer"
    else:
        facility = "Community Pantry / Ambient Dry Goods Bank"

    dte = float(lot.get("days_until_expiry", lot.get("days_to_expiry", 999)))
    urgency = "CRITICAL (Immediate Dispatch < 3 Hours)" if dte <= 2 else "STANDARD (Next Dispatch Wave)"

    return {
        "estimated_cargo_kg": cargo_kg,
        "input_quantity": raw_qty,
        "uom": uom,
        "equivalent_mass_kg": qty_kg,
        "vehicle_type": vehicle_type,
        "vehicle_title": vehicle_title,
        "vehicle_capacity": vehicle_capacity,
        "recommended_vehicle": f"{vehicle_title} ({vehicle_capacity})",
        "cold_chain_required": is_cold_chain,
        "cold_chain_type": "Refrigerated" if is_cold_chain else "Ambient",
        "storage_temperature_c": temp,
        "recommended_facility": facility,
        "transport_urgency": urgency,
        "food_category": raw_cat
    }


# ── Integration Pipeline Demonstration ──
if __name__ == "__main__":
    from src.ml.spoilage import predict_spoilage_risk

    print("=" * 70)
    print("END-TO-END DEMO: PERSON 1 (SPOILAGE RISK) -> PERSON 5 (DISPATCH CARGO)")
    print("=" * 70)

    # Sample inventory lot approaching expiry
    urgent_meat_lot = {
        "initial_quantity": 180,
        "base_price": 28.50,
        "daily_demand": 12.0,
        "days_until_expiry": 1,
        "shelf_life_days": 10,
        "category": "Meat",
        "region": "Midwest"
    }

    # Step 1: Person 1 ML Spoilage Classifier + Continuous Tier 2
    risk_assessment = predict_spoilage_risk(urgent_meat_lot, apply_tier2=True)
    print("\n[Step 1 - Person 1 Spoilage Assessment]:")
    print(f"  Risk Label     : {risk_assessment['label']}")
    print(f"  Confidence     : {risk_assessment['score'] * 100:.1f}%")
    print(f"  Urgency Factor : {risk_assessment['urgency_factor']}")

    # Step 2: Trigger Downstream Logistics Estimator if HIGH Risk
    if risk_assessment["label"] == "HIGH":
        print("\n[Step 2 - Person 5 Logistics Cargo Estimation]:")
        cargo_specs = estimate_dispatch_cargo(urgent_meat_lot, weather="Hot")
        print(f"  Estimated Cargo     : {cargo_specs['estimated_cargo_kg']} kg")
        print(f"  Recommended Vehicle : {cargo_specs['recommended_vehicle']}")
        print(f"  Cold Chain Required : {cargo_specs['cold_chain_required']}")
        print(f"  Target Facility     : {cargo_specs['recommended_facility']}")
        print(f"  Dispatch Urgency    : {cargo_specs['transport_urgency']}")

    print("\n" + "=" * 70)
