"""
Recommendation Router — Person 2 Backend API
=============================================
Integrates Person 4's Rule Engine (assign_route) into the FastAPI backend.
Endpoint: POST /api/recommend
"""

from fastapi import APIRouter, Body
from typing import Dict, Any

from src.engine.rule_engine import assign_route

router = APIRouter(
    tags=["Clearance Recommendation"]
)


@router.post("/api/recommend")
def recommend_action(payload: Dict[str, Any] = Body(...)):
    """
    Computes clearance recommendation (Normal Sale, Dynamic Markdown, Donation)
    based on days to expiry, 3-day forecast demand, stock surplus, and anti-moral-hazard quota.
    """
    dte = int(payload.get("days_to_expiry", payload.get("dteNum", 5)))
    qty = float(payload.get("quantity", payload.get("stockQty", 25.0)))
    unit_price = float(payload.get("unit_price_myr", payload.get("unitPrice", 10.0)))
    demand = float(payload.get("demand_forecast_3d", payload.get("forecast_demand", 15.0)))
    total_surplus = float(payload.get("total_surplus_volume", 100.0))
    donated_so_far = float(payload.get("cumulative_donated_volume", 0.0))

    decision = assign_route(
        days_to_expiry=dte,
        quantity=qty,
        demand_forecast_3d=demand,
        unit_price_myr=unit_price,
        total_surplus_volume=total_surplus,
        cumulative_donated_volume=donated_so_far
    )

    return {
        "status": "success",
        "recommended_route": decision.get("recommended_route"),
        "discount_percent": decision.get("discount_percent"),
        "discounted_price_myr": decision.get("discounted_price_myr"),
        "channel": decision.get("channel"),
        "moral_hazard_flag": decision.get("moral_hazard_flag", False),
        "reason": decision.get("reason"),
        "expected_value_myr": decision.get("expected_value_myr")
    }
