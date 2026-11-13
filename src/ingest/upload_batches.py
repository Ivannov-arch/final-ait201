"""
Dynamic Food Clearing House — Automated Supabase Ingestion Script
==================================================================
Person 4: Business Logic & Cloud Database Specialist
Goal 9 — Step 1.5

Reads the enriched inventory data (lots_routed.csv + canonical_batch_table.csv)
and the simulator event log (simulation_events.csv), then performs idempotent
upsert operations into the live Supabase PostgreSQL database.

What gets uploaded
------------------
  TABLE batches          ← lots_routed.csv  (enriched by rule_engine)
                           + canonical_batch_table.csv (risk_label, product_id,
                             demand_forecast_3d, waste_risk_score)
  TABLE simulation_events ← simulation_events.csv  (Person 3 simulator output)

Prerequisites
-------------
  1. Supabase project created (supabase.com)
  2. .env file at project root with:
       SUPABASE_URL=https://xxxx.supabase.co
       SUPABASE_SERVICE_ROLE_KEY=eyJ...   (use service role for write access)
  3. schema.sql already executed in Supabase SQL Editor
  4. Python packages installed:
       pip install supabase pandas python-dotenv

Usage
-----
  # Upload both batches AND simulation events (default)
  python src/ingest/upload_batches.py

  # Upload batches only
  python src/ingest/upload_batches.py --skip-events

  # Upload events only
  python src/ingest/upload_batches.py --skip-batches

  # Dry run (transform + validate, no network calls)
  python src/ingest/upload_batches.py --dry-run

  # Custom file paths
  python src/ingest/upload_batches.py \\
      --lots   data/processed/lots_routed.csv \\
      --events data/processed/simulation_events.csv
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from datetime import datetime
from typing import Any

import pandas as pd

# Allow running from project root or directly
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

# ---------------------------------------------------------------------------
# Default file paths (relative to project root)
# ---------------------------------------------------------------------------
DEFAULT_LOTS_PATH       = os.path.join("data", "processed", "lots_routed.csv")
DEFAULT_CANONICAL_PATH  = os.path.join("data", "processed", "canonical_batch_table.csv")
DEFAULT_EVENTS_PATH     = os.path.join("data", "processed", "simulation_events.csv")

UPSERT_CHUNK_SIZE = 100   # rows per Supabase upsert call (keeps payloads small)


# ===========================================================================
# TRANSFORM LAYER
# ===========================================================================

def transform_batches(
    lots_path: str,
    canonical_path: str,
) -> list[dict[str, Any]]:
    """
    Load lots_routed.csv + canonical_batch_table.csv, merge them,
    and return a list of dicts shaped to match the Supabase `batches` table.
    """
    print(f"\n  [batches] Loading {os.path.basename(lots_path)} …")
    lots = pd.read_csv(lots_path)
    print(f"  [batches] {len(lots):,} routed lots loaded.")

    # Merge in canonical columns: batch_id, product_id, risk_label,
    # demand_forecast_3d, waste_risk_score (all NULL until Person 2 & 5 deliver)
    canonical_cols = ["batch_id", "product_id", "canonical_category",
                      "risk_label", "demand_forecast_3d", "waste_risk_score", "uom"]
    if os.path.exists(canonical_path):
        print(f"  [batches] Merging canonical enrichments from {os.path.basename(canonical_path)} …")
        can = pd.read_csv(canonical_path)[canonical_cols]
        # canonical uses batch_id = CAN-XXXX, lots use lot_id = LOT-XXXX
        # Build mapping: LOT-1000 → CAN-2000 (they share the same positional index)
        can = can.reset_index(drop=True)
        lots = lots.reset_index(drop=True)
        for col in canonical_cols:
            if col == "batch_id":
                lots["batch_id"] = can["batch_id"]   # authoritative ID
            elif col in can.columns:
                lots[col] = can[col]
        print(f"  [batches] Canonical merge complete.")
    else:
        print(f"  [batches] WARNING: {canonical_path} not found — generating batch_id from lot_id.")
        lots["batch_id"]           = lots["lot_id"].str.replace("LOT-", "CAN-", regex=False)
        lots["product_id"]         = "SKU-" + lots["lot_id"]
        lots["canonical_category"] = lots["category"]
        lots["risk_label"]         = "LOW"
        lots["demand_forecast_3d"] = None
        lots["waste_risk_score"]   = None
        lots["uom"]                = "unit"

    # Build final records shaped to match schema.sql `batches` columns
    records: list[dict[str, Any]] = []
    for _, row in lots.iterrows():
        rec: dict[str, Any] = {
            # Identity
            "batch_id":           _str(row, "batch_id"),
            "product_id":         _str(row, "product_id"),
            "product_name":       _str(row, "product_name"),

            # Classification
            "category":           _str(row, "category"),
            "canonical_category": _str(row, "canonical_category"),

            # Stock
            "quantity":           _float(row, "quantity"),
            "uom":                _str(row, "uom", default="unit"),
            "expiry_date":        _str(row, "expiry_date"),
            "date_received":      _str(row, "date_received"),
            "shelf_life_days":    _int(row, "shelf_life_days"),
            "days_to_expiry":     _int(row, "days_to_expiry"),
            "turnover_ratio":     _float(row, "turnover_ratio"),
            "stock_pressure":     _float(row, "stock_pressure"),
            "reorder_level":      _int(row, "reorder_level"),

            # Pricing
            "unit_price_myr":     _float(row, "unit_price_myr"),

            # Location
            "store_id":           _str(row, "store_id"),

            # ML risk label (Person 1 / canonical)
            "risk_label":         _str(row, "risk_label", default="LOW"),

            # Rule engine output (Person 4)
            "recommended_route":      _str(row, "recommended_route"),
            "discount_percent":       _float(row, "discount_percent"),
            "discounted_price_myr":   _float(row, "discounted_price_myr"),
            "expected_value_myr":     _float(row, "expected_value_myr"),
            "channel":                _str(row, "channel", default="retail"),
            "moral_hazard_flag":      bool(row.get("moral_hazard_flag", False)),

            # Upgrade placeholders (NULL until Phase 2 models are ready)
            "demand_forecast_3d": _float(row, "demand_forecast_3d"),
            "waste_risk_score":   _float(row, "waste_risk_score"),
            "receiver_id":        None,
            "market_price_myr":   None,
        }
        records.append(rec)

    print(f"  [batches] Transformed {len(records):,} records → ready for upsert.")
    return records


def transform_events(events_path: str) -> list[dict[str, Any]]:
    """
    Load simulation_events.csv and return a list of dicts shaped
    to match the Supabase `simulation_events` table.
    """
    print(f"\n  [events] Loading {os.path.basename(events_path)} …")
    df = pd.read_csv(events_path)
    print(f"  [events] {len(df):,} simulation events loaded.")

    records: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        # metadata column is a JSON string in the CSV
        metadata = row.get("metadata", "{}")
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except (json.JSONDecodeError, TypeError):
                metadata = {}

        rec: dict[str, Any] = {
            "event_id":   _str(row, "event_id"),
            "batch_id":   _str(row, "batch_id"),
            "store_id":   _str(row, "store_id"),
            "event_type": _str(row, "event_type"),
            "timestamp":  _str(row, "timestamp"),
            "quantity":   _float(row, "quantity"),
            "metadata":   metadata,
        }
        records.append(rec)

    print(f"  [events] Transformed {len(records):,} records → ready for upsert.")
    return records


# ===========================================================================
# VALIDATE LAYER  (runs before any network calls)
# ===========================================================================

def validate_batches(records: list[dict]) -> None:
    """Raise ValueError if any batch record violates basic integrity rules."""
    errors: list[str] = []
    for i, rec in enumerate(records):
        if not rec.get("batch_id"):
            errors.append(f"Row {i}: missing batch_id")
        if rec.get("quantity", -1) < 0:
            errors.append(f"Row {i} ({rec.get('batch_id')}): negative quantity")
        if rec.get("unit_price_myr", -1) < 0:
            errors.append(f"Row {i} ({rec.get('batch_id')}): negative unit_price_myr")
        if rec.get("recommended_route") not in ("Normal Sale", "Dynamic Markdown", "Donation"):
            errors.append(f"Row {i} ({rec.get('batch_id')}): invalid recommended_route '{rec.get('recommended_route')}'")
    if errors:
        raise ValueError(f"Batch validation failed ({len(errors)} error(s)):\n" + "\n".join(errors[:10]))
    print(f"  [validate] batches: {len(records):,} records — all integrity checks passed.")


def validate_events(records: list[dict]) -> None:
    """Raise ValueError if any event record is malformed."""
    errors: list[str] = []
    valid_types = {"received", "active_fefo", "markdown", "dispatched", "wasted"}
    for i, rec in enumerate(records):
        if not rec.get("event_id"):
            errors.append(f"Row {i}: missing event_id")
        if rec.get("event_type") not in valid_types:
            errors.append(f"Row {i}: invalid event_type '{rec.get('event_type')}'")
    if errors:
        raise ValueError(f"Event validation failed ({len(errors)} error(s)):\n" + "\n".join(errors[:10]))
    print(f"  [validate] events: {len(records):,} records — all integrity checks passed.")


# ===========================================================================
# UPSERT LAYER
# ===========================================================================

def upsert_table(
    client: Any,
    table: str,
    records: list[dict],
    on_conflict: str,
    dry_run: bool = False,
) -> None:
    """
    Upsert `records` into `table` in chunks of UPSERT_CHUNK_SIZE rows.
    Uses on_conflict to make re-runs idempotent (safe to run multiple times).
    """
    total   = len(records)
    chunks  = math.ceil(total / UPSERT_CHUNK_SIZE)
    success = 0

    print(f"\n  [upsert] → {table}  ({total:,} rows, {chunks} chunk(s), on_conflict={on_conflict})")

    for i in range(chunks):
        chunk = records[i * UPSERT_CHUNK_SIZE : (i + 1) * UPSERT_CHUNK_SIZE]

        if dry_run:
            success += len(chunk)
            # Print first chunk as a sample
            if i == 0:
                print(f"  [dry-run] Sample record (chunk 1 / row 1):")
                for k, v in list(chunk[0].items())[:8]:
                    print(f"            {k}: {v}")
            continue

        try:
            (
                client.table(table)
                .upsert(chunk, on_conflict=on_conflict)
                .execute()
            )
            success += len(chunk)
            # Progress indicator every 10 chunks
            if (i + 1) % 10 == 0 or (i + 1) == chunks:
                pct = (i + 1) / chunks * 100
                print(f"  [upsert]   {success:,}/{total:,} rows  ({pct:.0f}%)")
        except Exception as exc:
            print(f"  [upsert] ERROR on chunk {i+1}: {exc}")
            raise

    label = "[dry-run]" if dry_run else "[upsert]"
    print(f"  {label} {table}: {success:,} rows upserted successfully.")


# ===========================================================================
# MAIN PIPELINE
# ===========================================================================

def run_ingestion(
    lots_path: str,
    canonical_path: str,
    events_path: str,
    skip_batches: bool = False,
    skip_events: bool = False,
    dry_run: bool = False,
) -> None:
    """Full ingestion pipeline: transform → validate → upsert."""

    _print_header(dry_run)

    # --- Load Supabase client ---
    client = None
    if not dry_run:
        client = _load_supabase_client()

    batch_records: list[dict] = []
    event_records: list[dict] = []

    # ---- BATCHES ----
    if not skip_batches:
        batch_records = transform_batches(lots_path, canonical_path)
        validate_batches(batch_records)
        upsert_table(client, "batches", batch_records, on_conflict="batch_id", dry_run=dry_run)

    # ---- SIMULATION EVENTS ----
    if not skip_events:
        if not os.path.exists(events_path):
            print(f"\n  [events] SKIP — {events_path} not found (Person 3 pending).")
        else:
            event_records = transform_events(events_path)
            validate_events(event_records)
            # Events FK to batches — batches must be upserted first (already done above)
            upsert_table(client, "simulation_events", event_records, on_conflict="event_id", dry_run=dry_run)

    _print_summary(batch_records, event_records, dry_run)


# ===========================================================================
# HELPERS
# ===========================================================================

def _load_supabase_client() -> Any:
    """Load .env, validate credentials, and return a Supabase client."""
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        print("  WARNING: python-dotenv not installed — reading env vars directly.")

    url = (
        os.environ.get("SUPABASE_URL", "").strip()
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").strip()
    )
    # Prefer service_role / secret key for write operations; fallback to anon / publishable
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or os.environ.get("SUPABASE_SECRET_KEY", "").strip()
        or os.environ.get("SUPABASE_ANON_KEY", "").strip()
        or os.environ.get("SUPABASE_PUBLISHABLE_KEY", "").strip()
        or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "").strip()
    )

    if not url or not key:
        raise EnvironmentError(
            "\n  Missing Supabase credentials in .env\n"
            "  Required variables:\n"
            "    SUPABASE_URL=https://xxxx.supabase.co\n"
            "    SUPABASE_SERVICE_ROLE_KEY=eyJ...\n"
            "  Copy .env.example → .env and fill in your Supabase project values."
        )

    try:
        from supabase import create_client
    except ImportError:
        raise ImportError(
            "\n  supabase-py is not installed.\n"
            "  Run: pip install supabase"
        )

    print(f"\n  [supabase] Connecting to {url[:40]}…")
    client = create_client(url, key)
    print(f"  [supabase] Connection established.")
    return client


def _str(row: "pd.Series", col: str, default: str = "") -> str | None:  # type: ignore[name-defined]
    val = row.get(col, default)
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    return str(val).strip() or None


def _float(row: "pd.Series", col: str) -> float | None:  # type: ignore[name-defined]
    val = row.get(col)
    if val is None:
        return None
    try:
        f = float(val)
        return None if math.isnan(f) else round(f, 4)
    except (TypeError, ValueError):
        return None


def _int(row: "pd.Series", col: str) -> int | None:  # type: ignore[name-defined]
    val = row.get(col)
    if val is None:
        return None
    try:
        f = float(val)
        return None if math.isnan(f) else int(f)
    except (TypeError, ValueError):
        return None


def _print_header(dry_run: bool) -> None:
    mode = " [DRY-RUN — no data will be written]" if dry_run else ""
    print(f"\n{'='*62}")
    print(f"  DYNAMIC FOOD CLEARING HOUSE — Supabase Ingestion{mode}")
    print(f"{'='*62}")
    print(f"  Started : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*62}")


def _print_summary(
    batch_records: list[dict],
    event_records: list[dict],
    dry_run: bool,
) -> None:
    mode = "DRY-RUN" if dry_run else "LIVE"
    print(f"\n{'='*62}")
    print(f"  INGESTION COMPLETE  [{mode}]")
    print(f"{'='*62}")
    print(f"  batches uploaded          : {len(batch_records):>6,}")
    print(f"  simulation_events uploaded: {len(event_records):>6,}")
    if batch_records:
        routes = {}
        for r in batch_records:
            routes[r["recommended_route"]] = routes.get(r["recommended_route"], 0) + 1
        print(f"\n  Route distribution in batches table:")
        for route, count in sorted(routes.items()):
            print(f"    {route:<22}: {count:,}")
    print(f"{'='*62}\n")


# ===========================================================================
# CLI
# ===========================================================================

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Upsert lots_routed.csv and simulation_events.csv into Supabase."
    )
    p.add_argument("--lots",         default=DEFAULT_LOTS_PATH,
                   help=f"Path to lots CSV (default: {DEFAULT_LOTS_PATH})")
    p.add_argument("--canonical",    default=DEFAULT_CANONICAL_PATH,
                   help=f"Path to canonical batch table CSV")
    p.add_argument("--events",       default=DEFAULT_EVENTS_PATH,
                   help=f"Path to simulation events CSV")
    p.add_argument("--skip-batches", action="store_true",
                   help="Skip uploading batches table")
    p.add_argument("--skip-events",  action="store_true",
                   help="Skip uploading simulation_events table")
    p.add_argument("--dry-run",      action="store_true",
                   help="Transform & validate only — no Supabase writes")
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    run_ingestion(
        lots_path       = args.lots,
        canonical_path  = args.canonical,
        events_path     = args.events,
        skip_batches    = args.skip_batches,
        skip_events     = args.skip_events,
        dry_run         = args.dry_run,
    )

