"""
Dynamic Food Clearing House — Rule Engine & Anti-Moral-Hazard Logic
==================================================================
Person 4: Business Logic & Cloud Database Specialist
Goal 6 Base+ (Dynamic Markdown + Anti-Moral-Hazard)

This module implements the core clearance-decision engine for the
Dynamic Food Clearing House system. It classifies each inventory lot
into one of three Base routes:

    1. Normal Sale      — Full-price sale (DTE > 3 days)
    2. Dynamic Markdown — Tiered discount 15–40% (1 < DTE <= 3 days)
    3. Donation         — Closed transfer to NGO/food bank (DTE <= 1 day)

Anti-Moral-Hazard Rules (Retail Channel Segregation):
  - Donations are always "closed_ngo" channel; never displayed on retail shelves.
  - Maximum 30% of a store's total surplus volume may be donated.
    Lots that would breach the cap are redirected to aggressive markdown (50%).

Usage
-----
    from src.engine.rule_engine import assign_route, evaluate_lot_dataframe

    # Single lot evaluation
    result = assign_route(
        days_to_expiry=2,
        quantity=50.0,
        demand_forecast_3d=30.0,
        unit_price_myr=20.47,
        total_surplus_volume=200.0,
        cumulative_donated_volume=55.0,
    )

    # Bulk CSV evaluation
    import pandas as pd
    df = pd.read_csv("data/processed/lots_base.csv")
    routed = evaluate_lot_dataframe(df)
"""

from __future__ import annotations

from typing import Any


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DONATION_QUOTA_CAP: float = 0.30     # max 30 % of total surplus may be donated
MARKDOWN_AGGRESSIVE: float = 0.50    # discount applied when donation quota exceeded
DONATION_CHANNEL: str = "closed_ngo" # never shown on retail shelves

# Tiered markdown schedule based on days-to-expiry
# Key   = days_to_expiry (int)
# Value = discount fraction  (e.g. 0.15 = 15 % off)
MARKDOWN_TIERS: dict[int, float] = {
    3: 0.15,   # 3 days left → 15 % off
    2: 0.25,   # 2 days left → 25 % off
    1: 0.40,   # 1 day  left → 40 % off  (last-chance markdown before donation)
}


# ---------------------------------------------------------------------------
# Core decision function
# ---------------------------------------------------------------------------

def assign_route(
    days_to_expiry: int,
    quantity: float,
    demand_forecast_3d: float,
    unit_price_myr: float,
    total_surplus_volume: float = 0.0,
    cumulative_donated_volume: float = 0.0,
) -> dict[str, Any]:
    """
    Evaluate a single inventory lot and determine its optimal clearance route.

    Parameters
    ----------
    days_to_expiry : int
        Remaining shelf-life in whole days. Negative values are treated as 0
        (already-expired stock, routes to Donation / aggressive markdown).
    quantity : float
        Lot size in kg or units.
    demand_forecast_3d : float
        Predicted demand for this product over the next 3 days.
    unit_price_myr : float
        Current full selling price in Malaysian Ringgit (MYR).
    total_surplus_volume : float, optional
        Combined volume (kg/units) of *all* surplus lots at this store in the
        current evaluation run. Used to compute the 30 % donation quota.
        Pass 0.0 to skip quota enforcement.
    cumulative_donated_volume : float, optional
        Volume already earmarked for donation in this evaluation run, *before*
        this lot is processed. Used to check whether the cap is still open.

    Returns
    -------
    dict with keys:
        recommended_route     : str   — "Normal Sale" | "Dynamic Markdown" | "Donation"
        discount_percent      : float — 0.0–1.0 (e.g. 0.25 = 25 %)
        discounted_price_myr  : float — effective per-unit price after discount
        expected_value_myr    : float — total financial realisation for the lot
        channel               : str   — "retail" | "closed_ngo"
        moral_hazard_flag     : bool  — True if donation cap was breached and
                                        lot was redirected to aggressive markdown
        reason                : str   — human-readable decision rationale
    """
    # --- Defensive input normalisation ---
    dte = max(int(days_to_expiry), 0)
    qty = max(float(quantity), 0.0)
    price = max(float(unit_price_myr), 0.0)
    demand = max(float(demand_forecast_3d), 0.0)

    # Determine whether the lot is in surplus (stock > forecast demand)
    is_surplus: bool = qty > demand

    # -----------------------------------------------------------------------
    # Route Decision Tree (FEFO Priority)
    # -----------------------------------------------------------------------

    # 1. DONATION — imminent expiry (DTE ≤ 1); prefer donation if quota allows
    if dte <= 1:
        return _route_donation_or_cap(
            dte=dte,
            qty=qty,
            price=price,
            total_surplus_volume=total_surplus_volume,
            cumulative_donated_volume=cumulative_donated_volume,
        )

    # 2. DYNAMIC MARKDOWN — approaching expiry (1 < DTE ≤ 3)
    if dte <= 3:
        discount = MARKDOWN_TIERS.get(dte, 0.15)   # DTE=2 -> 25%, DTE=3 -> 15%
        return _make_result(
            route="Dynamic Markdown",
            discount=discount,
            price=price,
            qty=qty,
            channel="retail",
            moral_hazard=False,
            reason=(
                f"DTE={dte}d surplus lot. Applied tiered markdown: "
                f"{discount*100:.0f}% off → RM {price * (1 - discount):.2f}/unit."
            ),
        )

    # 3. SHELF LIFE > 3 DAYS
    if is_surplus:
        discount = 0.15
        return _make_result(
            route="Dynamic Markdown",
            discount=discount,
            price=price,
            qty=qty,
            channel="retail",
            moral_hazard=False,
            reason=(
                f"DTE={dte}d with surplus volume (qty={qty:.1f} > demand={demand:.1f}). "
                f"Early 15% markdown recommended to balance velocity."
            ),
        )

    # Normal Sale — plenty of shelf life left and demand is healthy
    return _make_result(
        route="Normal Sale",
        discount=0.0,
        price=price,
        qty=qty,
        channel="retail",
        moral_hazard=False,
        reason=f"DTE={dte}d, demand={demand:.1f} ≥ qty={qty:.1f}. "
               f"Full-price sale at RM {price:.2f}.",
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _route_donation_or_cap(
    dte: int,
    qty: float,
    price: float,
    total_surplus_volume: float,
    cumulative_donated_volume: float,
) -> dict[str, Any]:
    """
    Sub-decision for DTE ≤ 1: donate if quota permits, else aggressive markdown.
    """
    quota_ok = _donation_quota_ok(qty, total_surplus_volume, cumulative_donated_volume)

    if quota_ok:
        return _make_result(
            route="Donation",
            discount=1.0,       # full value surrendered to food bank
            price=price,
            qty=qty,
            channel=DONATION_CHANNEL,
            moral_hazard=False,
            reason=(
                f"DTE={dte}d, imminent expiry. Routed to closed NGO/food bank "
                f"(quota: {cumulative_donated_volume:.1f} + {qty:.1f} ≤ "
                f"{total_surplus_volume * DONATION_QUOTA_CAP:.1f} of surplus)."
            ),
        )
    else:
        # Quota exceeded — apply aggressive markdown instead to protect retail revenue
        return _make_result(
            route="Dynamic Markdown",
            discount=MARKDOWN_AGGRESSIVE,
            price=price,
            qty=qty,
            channel="retail",
            moral_hazard=True,
            reason=(
                f"DTE={dte}d, but donation quota of {DONATION_QUOTA_CAP*100:.0f}% "
                f"already filled ({cumulative_donated_volume:.1f}/{total_surplus_volume * DONATION_QUOTA_CAP:.1f} "
                f"kg). Redirected to aggressive markdown: "
                f"{MARKDOWN_AGGRESSIVE*100:.0f}% off → RM {price * (1 - MARKDOWN_AGGRESSIVE):.2f}/unit."
            ),
        )


def _donation_quota_ok(
    qty: float,
    total_surplus_volume: float,
    cumulative_donated_volume: float,
) -> bool:
    """
    Return True if adding `qty` to donations would not exceed the 30 % cap.
    If total_surplus_volume is 0 (quota enforcement disabled), always allow.
    """
    if total_surplus_volume <= 0:
        return True  # quota enforcement not active for this call
    allowed = total_surplus_volume * DONATION_QUOTA_CAP
    return (cumulative_donated_volume + qty) <= allowed


def _make_result(
    route: str,
    discount: float,
    price: float,
    qty: float,
    channel: str,
    moral_hazard: bool,
    reason: str,
) -> dict[str, Any]:
    """Assemble the standard result dictionary."""
    discounted_price = price * (1.0 - discount)
    expected_value = discounted_price * qty if route != "Donation" else 0.0

    return {
        "recommended_route": route,
        "discount_percent": round(discount, 4),
        "discounted_price_myr": round(discounted_price, 2),
        "expected_value_myr": round(expected_value, 2),
        "channel": channel,
        "moral_hazard_flag": moral_hazard,
        "reason": reason,
    }


# ---------------------------------------------------------------------------
# Bulk / DataFrame Evaluator
# ---------------------------------------------------------------------------

def evaluate_lot_dataframe(
    df: "pandas.DataFrame",  # type: ignore[name-defined]
    demand_col: str = "demand_forecast_3d",
    fallback_demand: float = 0.0,
) -> "pandas.DataFrame":  # type: ignore[name-defined]
    """
    Apply assign_route() to every row of a lot DataFrame (e.g. lots_base.csv).

    Parameters
    ----------
    df : pd.DataFrame
        Must contain columns: lot_id / batch_id, days_to_expiry, quantity,
        unit_price_myr, store_id.
    demand_col : str
        Column name for the 3-day demand forecast. If the column is absent,
        `fallback_demand` is used for all rows.
    fallback_demand : float
        Default demand used when demand_col is not present.

    Returns
    -------
    pd.DataFrame
        Input dataframe with added columns:
            recommended_route, discount_percent, discounted_price_myr,
            expected_value_myr, channel, moral_hazard_flag, reason.
    """
    import pandas as pd

    result_df = df.copy()

    # Resolve demand column
    if demand_col not in result_df.columns:
        result_df["_demand_tmp"] = fallback_demand
        demand_col_actual = "_demand_tmp"
    else:
        demand_col_actual = demand_col

    # Pre-compute per-store total surplus volume (used for donation quota)
    # Surplus = lots where qty > demand
    def _surplus_flag(row: "pd.Series") -> bool:  # type: ignore[name-defined]
        return float(row["quantity"]) > float(row[demand_col_actual])

    result_df["_is_surplus"] = result_df.apply(_surplus_flag, axis=1)
    store_surplus_volume = (
        result_df[result_df["_is_surplus"]]
        .groupby("store_id")["quantity"]
        .sum()
        .to_dict()
    )

    # Process each row in store groups to track cumulative donated volume correctly
    output_rows: list[dict[str, Any]] = []
    cumulative_donated: dict[str, float] = {}

    for _, row in result_df.iterrows():
        store_id = str(row.get("store_id", "unknown"))
        total_surplus = store_surplus_volume.get(store_id, 0.0)
        donated_so_far = cumulative_donated.get(store_id, 0.0)

        decision = assign_route(
            days_to_expiry=int(row["days_to_expiry"]),
            quantity=float(row["quantity"]),
            demand_forecast_3d=float(row[demand_col_actual]),
            unit_price_myr=float(row["unit_price_myr"]),
            total_surplus_volume=total_surplus,
            cumulative_donated_volume=donated_so_far,
        )

        # Update cumulative donation tracker for this store
        if decision["recommended_route"] == "Donation":
            cumulative_donated[store_id] = donated_so_far + float(row["quantity"])

        output_rows.append(decision)

    # Merge decision columns back into result_df
    decisions_df = pd.DataFrame(output_rows)
    for col in decisions_df.columns:
        result_df[col] = decisions_df[col].values

    # Clean up temp columns
    result_df.drop(columns=["_is_surplus", "_demand_tmp"], errors="ignore", inplace=True)

    return result_df

