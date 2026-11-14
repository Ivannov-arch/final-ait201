"""
Dynamic Food Clearing House — Batch Evaluation & Scoring Script
===============================================================
Person 4: Business Logic & Cloud Database Specialist
Goal 6 Base+ — Step 1.2

This script ingests `lots_base.csv`, evaluates every lot through the
Rule Engine (`assign_route`), and writes the enriched result to
`data/processed/lots_routed.csv`.

It also prints a human-readable clearance report to the terminal,
giving a snapshot of route distribution, revenue impact, and any
moral-hazard triggers across each store.

Output Columns Added to lots_routed.csv
----------------------------------------
  recommended_route     : str   — "Normal Sale" | "Dynamic Markdown" | "Donation"
  discount_percent      : float — 0.0–1.0
  discounted_price_myr  : float — effective per-unit price
  expected_value_myr    : float — total revenue realisation for the lot
  channel               : str   — "retail" | "closed_ngo"
  moral_hazard_flag     : bool  — True if donation quota was exceeded
  reason                : str   — decision rationale string

Usage
-----
  Run from project root:
    python -m src.engine.evaluate_inventory

  Or directly:
    python src/engine/evaluate_inventory.py

  With custom paths:
    python src/engine/evaluate_inventory.py \\
        --input  data/processed/lots_base.csv \\
        --output data/processed/lots_routed.csv
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime

import pandas as pd

# Allow running as a script from project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from src.engine.rule_engine import evaluate_lot_dataframe, DONATION_QUOTA_CAP

# ---------------------------------------------------------------------------
# Default paths (relative to project root)
# ---------------------------------------------------------------------------
MASTER_INPUT   = os.path.join("data", "processed", "inventory_master.csv")
DEFAULT_INPUT  = MASTER_INPUT if os.path.exists(MASTER_INPUT) else os.path.join("data", "processed", "lots_base.csv")
DEFAULT_OUTPUT = os.path.join("data", "processed", "lots_routed.csv")
MIRROR_OUTPUT  = os.path.join("output", "lots_routed.csv")


# ---------------------------------------------------------------------------
# Main evaluation pipeline
# ---------------------------------------------------------------------------

def run_evaluation(input_path: str, output_path: str) -> pd.DataFrame:
    """
    Load lots_base.csv, run assign_route() on every row, save lots_routed.csv.

    Returns the enriched DataFrame.
    """
    # --- Load ---
    print(f"\n{'='*62}")
    print(f"  DYNAMIC FOOD CLEARING HOUSE — Batch Clearance Evaluator")
    print(f"{'='*62}")
    print(f"  Input  : {input_path}")
    print(f"  Output : {output_path}")
    print(f"  Run at : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*62}\n")

    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")

    df = pd.read_csv(input_path)
    print(f"  Loaded {len(df):,} lots from {os.path.basename(input_path)}.")
    print(f"  Stores  : {sorted(df['store_id'].unique())}")
    print(f"  DTE range: {int(df['days_to_expiry'].min())}d – {int(df['days_to_expiry'].max())}d\n")

    # --- Evaluate ---
    # `demand_forecast_3d` column is absent in lots_base.csv (only in canonical).
    # The evaluator will use fallback_demand=0.0, treating all lots as surplus.
    # When Person 2's forecast model is integrated, this column will be populated.
    routed = evaluate_lot_dataframe(
        df,
        demand_col="demand_forecast_3d",
        fallback_demand=0.0,
    )

    # --- Save ---
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    routed.to_csv(output_path, index=False)
    print(f"  Saved {len(routed):,} routed lots → {output_path}")

    # Mirror copy to /output/
    os.makedirs(os.path.dirname(MIRROR_OUTPUT), exist_ok=True)
    routed.to_csv(MIRROR_OUTPUT, index=False)
    print(f"  Mirror  → {MIRROR_OUTPUT}")

    # --- Terminal Report ---
    _print_report(routed)

    return routed


# ---------------------------------------------------------------------------
# Terminal summary report
# ---------------------------------------------------------------------------

def _print_report(df: pd.DataFrame) -> None:
    """Print a formatted clearance summary to stdout."""
    total = len(df)
    route_counts = df["recommended_route"].value_counts()
    moral_hazard_total = int(df["moral_hazard_flag"].sum())
    total_revenue = df["expected_value_myr"].sum()
    donation_qty = df.loc[df["recommended_route"] == "Donation", "quantity"].sum()
    markdown_savings = df.loc[
        df["recommended_route"] == "Dynamic Markdown", "expected_value_myr"
    ].sum()

    sep = "-" * 62

    print(f"\n{sep}")
    print(f"  CLEARANCE ROUTE SUMMARY  ({total:,} lots)")
    print(f"{sep}")
    for route in ["Normal Sale", "Dynamic Markdown", "Donation"]:
        count = route_counts.get(route, 0)
        pct   = count / total * 100 if total > 0 else 0
        bar   = "█" * int(pct / 2)
        print(f"  {route:<22}  {count:>4} lots  ({pct:5.1f}%)  {bar}")

    print(f"{sep}")
    print(f"  Total projected revenue   : RM {total_revenue:>12,.2f}")
    print(f"  Revenue from markdowns    : RM {markdown_savings:>12,.2f}")
    print(f"  Qty routed to food banks  :    {donation_qty:>12,.1f} units/kg")
    print(f"  Anti-moral-hazard triggers:    {moral_hazard_total:>12,}")
    print(f"{sep}")

    # Per-store breakdown
    print(f"\n  PER-STORE BREAKDOWN")
    print(f"  {'Store':<18}  {'Normal':>6}  {'Markdown':>8}  {'Donation':>8}  {'Revenue (RM)':>14}")
    print(f"  {'-'*18}  {'-'*6}  {'-'*8}  {'-'*8}  {'-'*14}")
    for store_id, grp in df.groupby("store_id"):
        rc = grp["recommended_route"].value_counts()
        rev = grp["expected_value_myr"].sum()
        print(
            f"  {store_id:<18}  "
            f"{rc.get('Normal Sale', 0):>6}  "
            f"{rc.get('Dynamic Markdown', 0):>8}  "
            f"{rc.get('Donation', 0):>8}  "
            f"RM {rev:>11,.2f}"
        )

    # Flag moral-hazard lots for visibility
    mh_df = df[df["moral_hazard_flag"]]
    if not mh_df.empty:
        print(f"\n  ⚠  ANTI-MORAL-HAZARD REDIRECTS ({len(mh_df)} lots)")
        print(f"  {'Lot ID':<12}  {'Product':<22}  {'DTE':>4}  {'Discount':>8}")
        print(f"  {'-'*12}  {'-'*22}  {'-'*4}  {'-'*8}")
        for _, row in mh_df.iterrows():
            id_col = "lot_id" if "lot_id" in row.index else "batch_id"
            print(
                f"  {row[id_col]:<12}  {str(row['product_name']):<22}  "
                f"{int(row['days_to_expiry']):>4}d  "
                f"{(row.get('discount_fraction', row['discount_percent'] / 100 if row['discount_percent'] > 1.0 else row['discount_percent']) * 100):>7.0f}%"
            )
    else:
        print(f"\n  ✓  No anti-moral-hazard redirects triggered in this run.")

    print(f"\n{sep}\n")


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate all inventory lots and produce lots_routed.csv"
    )
    parser.add_argument(
        "--input", default=DEFAULT_INPUT,
        help=f"Path to input CSV (default: {DEFAULT_INPUT})"
    )
    parser.add_argument(
        "--output", default=DEFAULT_OUTPUT,
        help=f"Path to output CSV (default: {DEFAULT_OUTPUT})"
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    run_evaluation(args.input, args.output)

