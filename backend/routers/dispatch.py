"""
Dispatch & Logistics Router — Person 2 & Person 5 Integration
=============================================================
Computes smart receiver matching, cargo volume estimation, and OSRM driving routes.
Endpoint: GET /api/dispatch-route/{batch_id}
"""

import math
import requests
from fastapi import APIRouter, HTTPException, Query, Body
from typing import Optional

from backend.services.batch_service import get_batch_by_id
from src.ml.dispatch_estimator import estimate_dispatch_cargo

router = APIRouter(
    tags=["Smart Dispatch & Routing"]
)

STORE_LOCATION = {
    "name": "FreshGuard Retail Hub (MY-KL-001)",
    "address": "Jalan Bukit Bintang, Kuala Lumpur",
    "lat": 3.1466,
    "lng": 101.7118
}

RECEIVERS = [
    {
        "id": "REC-01",
        "name": "Kechara Soup Kitchen",
        "location": "Jalan Imbi, Bukit Bintang, KL",
        "lat": 3.1448,
        "lng": 101.7139,
        "capacity_kg": 250,
        "available_kg": 160,
        "cold_storage": False,
        "accepted_categories": ["Produce", "Fruits", "Vegetables", "Bakery", "Prepared Food"]
    },
    {
        "id": "REC-02",
        "name": "The Lost Food Project (TLFP)",
        "location": "Kota Damansara, Petaling Jaya",
        "lat": 3.1517,
        "lng": 101.5947,
        "capacity_kg": 500,
        "available_kg": 380,
        "cold_storage": True,
        "accepted_categories": ["Produce", "Dairy", "Meat", "Seafood", "Bakery", "Grains & Pulses"]
    },
    {
        "id": "REC-03",
        "name": "Yayasan Food Bank Malaysia",
        "location": "Seksyen 15, Shah Alam, Selangor",
        "lat": 3.0645,
        "lng": 101.5302,
        "capacity_kg": 800,
        "available_kg": 620,
        "cold_storage": True,
        "accepted_categories": ["Produce", "Dairy", "Meat", "Seafood", "Dry Goods"]
    },
    {
        "id": "REC-04",
        "name": "Dapur Jalanan Kuala Lumpur",
        "location": "Panggung Anniversary, KL",
        "lat": 3.1485,
        "lng": 101.6912,
        "capacity_kg": 120,
        "available_kg": 75,
        "cold_storage": False,
        "accepted_categories": ["Bakery", "Prepared Food", "Fruits"]
    }
]


def _haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Fallback straight-line calculation in km."""
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2)**2
    return round(2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a)), 2)


def _fetch_osrm_route(lon1: float, lat1: float, lon2: float, lat2: float) -> dict:
    """Queries public OSRM driving engine with fallback."""
    url = f"http://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson"
    try:
        resp = requests.get(url, timeout=(0.5, 1.5))
        if resp.status_code == 200:
            data = resp.json()
            if data.get("routes"):
                best = data["routes"][0]
                dist_km = round(best.get("distance", 0.0) / 1000.0, 2)
                eta_min = round(best.get("duration", 0.0) / 60.0, 1)
                geometry = best.get("geometry", {}).get("coordinates", [])
                return {
                    "distance_km": dist_km,
                    "eta_minutes": eta_min,
                    "geometry": geometry,
                    "source": "osrm_live"
                }
    except Exception:
        pass

    # Fallback to Haversine approximation
    dist_km = _haversine_distance_km(lat1, lon1, lat2, lon2)
    eta_min = round((dist_km / 35.0) * 60.0, 1)  # average 35 km/h urban speed
    return {
        "distance_km": dist_km,
        "eta_minutes": eta_min,
        "geometry": [[lon1, lat1], [lon2, lat2]],
        "source": "haversine_fallback"
    }


@router.get("/api/dispatch-route/{batch_id}")
def get_dispatch_route(batch_id: str, weather: Optional[str] = "Sunny"):
    """
    Computes complete smart dispatch logistics for a batch:
    1. Cargo weight & cold-chain specs via Person 5 ML Cargo Estimator
    2. Receiver matching based on category & cold storage availability
    3. Road driving distance & ETA via OSRM Engine
    """
    batch = get_batch_by_id(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found in inventory")

    # 1. Cargo Estimation
    cargo_specs = estimate_dispatch_cargo(batch, weather=weather)

    # 2. Smart Receiver Matching
    cat = str(batch.get("category", "")).lower()
    requires_cold = cargo_specs["cold_chain_required"]

    matched_receiver = None
    for r in RECEIVERS:
        # Check cold storage requirement
        if requires_cold and not r["cold_storage"]:
            continue
        # Check category match
        cat_matches = any(c.lower() in cat or cat in c.lower() for c in r["accepted_categories"])
        if cat_matches and r["available_kg"] >= cargo_specs["estimated_cargo_kg"]:
            matched_receiver = r
            break

    # If no cold storage match, take largest capacity receiver
    if not matched_receiver:
        matched_receiver = max(RECEIVERS, key=lambda x: x["available_kg"])

    # 3. Compute OSRM Route
    route_info = _fetch_osrm_route(
        lon1=STORE_LOCATION["lng"],
        lat1=STORE_LOCATION["lat"],
        lon2=matched_receiver["lng"],
        lat2=matched_receiver["lat"]
    )

    return {
        "status": "success",
        "batch_id": batch_id,
        "product_name": batch.get("food_name"),
        "cargo_specs": cargo_specs,
        "origin": STORE_LOCATION,
        "destination": matched_receiver,
        "route": route_info
    }


@router.post("/api/dispatch")
def log_dispatch(payload: dict = Body(...)):
    """Logs a dispatch handover event and syncs to Supabase if configured."""
    import os
    import time
    from datetime import datetime

    dispatch_id = payload.get("dispatch_id") or f"DSP-{hex(int(time.time()*1000))[2:].upper()}"
    record = {
        "dispatch_id": dispatch_id,
        "batch_id": payload.get("batch_id"),
        "receiver_id": payload.get("receiver_id", "REC-01"),
        "store_id": "MY-KL-001",
        "distance_km": float(payload.get("distance_km") or 5.0),
        "eta_hours": round(float(payload.get("eta_minutes") or 15) / 60.0, 2),
        "status": "dispatched",
        "created_at": datetime.utcnow().isoformat()
    }

    supabase_url = os.getenv("SUPABASE_URL", os.getenv("VITE_SUPABASE_URL", ""))
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_KEY", os.getenv("VITE_SUPABASE_ANON_KEY", "")))

    if supabase_url and supabase_key:
        try:
            headers = {
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates"
            }
            requests.post(
                f"{supabase_url}/rest/v1/dispatch_log",
                headers=headers,
                json=[record],
                timeout=3
            )
            event = {
                "event_id": f"EVT-{dispatch_id}",
                "batch_id": payload.get("batch_id"),
                "store_id": "MY-KL-001",
                "event_type": "dispatched",
                "quantity": float(payload.get("quantity") or 10),
                "metadata": {
                    "receiver_id": payload.get("receiver_id"),
                    "receiver_name": payload.get("receiver_name"),
                    "distance_km": payload.get("distance_km"),
                    "eta_minutes": payload.get("eta_minutes")
                }
            }
            requests.post(
                f"{supabase_url}/rest/v1/simulation_events",
                headers=headers,
                json=[event],
                timeout=3
            )
        except Exception as e:
            print(f"[Supabase Sync] dispatch notice: {e}")

    return {"status": "dispatched", "record": record}

