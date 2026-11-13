"""Discrete-Event Simulator Engine for Multi-Store Retail Surplus (Person 3 - Goal 4 Full).

Simulates dynamic food batch lifecycle across multi-store supermarket network.
Produces `simulation_events.csv` with strict retail event types:
- `received`: Stock arrival at store warehouse.
- `active_fefo`: Stock displayed on retail shelves sorted by FEFO.
- `markdown`: Dynamic price discount applied as expiration nears.
- `dispatched`: Surplus stock routed and sent to food banks via OSRM.
- `wasted`: Spoiled stock discarded to landfill (losses).
"""

from __future__ import annotations

import csv
from datetime import datetime, timedelta
import json
import os
import random
from typing import Any
import uuid

CANONICAL_PATH = os.path.join("data", "processed", "canonical_batch_table.csv")
OUTPUT_EVENTS_PATH = os.path.join("data", "processed", "simulation_events.csv")
OUTPUT_MIRROR_PATH = os.path.join("output", "simulation_events.csv")

ANCHOR_DATE = datetime(2026, 10, 30, 8, 0, 0)


def run_discrete_event_simulation(
    canonical_file: str = CANONICAL_PATH,
    output_path: str = OUTPUT_EVENTS_PATH,
    mirror_path: str = OUTPUT_MIRROR_PATH,
    simulation_days: int = 14,
    random_seed: int = 42,
) -> list[dict[str, Any]]:
    """Runs a discrete event simulation over a given time horizon."""
    random.seed(random_seed)
    
    if not os.path.exists(canonical_file):
        raise FileNotFoundError(f"Canonical batch table not found: {canonical_file}")

    batches = []
    with open(canonical_file, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            batches.append(r)

    print(f"[SIMULATOR] Loaded {len(batches)} batches. Simulating {simulation_days}-day horizon...")

    events: list[dict[str, Any]] = []

    for b in batches:
        batch_id = b["batch_id"]
        store_id = b["store_id"]
        product_name = b["product_name"]
        category = b["canonical_category"]
        initial_qty = float(b["quantity"])
        unit_price = float(b["unit_price_myr"])
        dte = int(b["days_to_expiry"])

        # Event 1: received (when lot arrives at store)
        rec_time = ANCHOR_DATE - timedelta(days=max(1, 14 - dte))
        events.append({
            "event_id": str(uuid.uuid4())[:8],
            "batch_id": batch_id,
            "store_id": store_id,
            "event_type": "received",
            "timestamp": rec_time.strftime("%Y-%m-%dT%H:%M:%S+08:00"),
            "quantity": f"{initial_qty:.1f}",
            "metadata": json.dumps({
                "product_name": product_name,
                "category": category,
                "unit_price_myr": unit_price,
                "status": "Inbound Received"
            })
        })

        # Event 2: active_fefo (placed on shelf under FEFO priority)
        fefo_time = rec_time + timedelta(hours=4)
        events.append({
            "event_id": str(uuid.uuid4())[:8],
            "batch_id": batch_id,
            "store_id": store_id,
            "event_type": "active_fefo",
            "timestamp": fefo_time.strftime("%Y-%m-%dT%H:%M:%S+08:00"),
            "quantity": f"{initial_qty:.1f}",
            "metadata": json.dumps({
                "shelf_rank": "High Priority FEFO",
                "days_to_expiry": dte,
                "initial_price_myr": unit_price
            })
        })

        # Progress lifecycle based on days to expiry
        if dte <= 4:
            # Event 3: markdown (applied 2-4 days before expiration)
            markdown_time = ANCHOR_DATE + timedelta(days=1, hours=random.randint(9, 12))
            discount_pct = 25 if dte > 2 else 40
            discounted_price = round(unit_price * (1.0 - (discount_pct / 100.0)), 2)
            sold_on_markdown = round(initial_qty * random.uniform(0.5, 0.75), 1)
            remaining_surplus = round(max(0.0, initial_qty - sold_on_markdown), 1)

            events.append({
                "event_id": str(uuid.uuid4())[:8],
                "batch_id": batch_id,
                "store_id": store_id,
                "event_type": "markdown",
                "timestamp": markdown_time.strftime("%Y-%m-%dT%H:%M:%S+08:00"),
                "quantity": f"{initial_qty:.1f}",
                "metadata": json.dumps({
                    "discount_percent": discount_pct,
                    "discounted_price_myr": discounted_price,
                    "units_sold_markdown": sold_on_markdown,
                    "remaining_surplus": remaining_surplus
                })
            })

            # Event 4 or 5: dispatched (donation) or wasted
            if remaining_surplus > 0:
                terminal_time = markdown_time + timedelta(hours=random.randint(18, 30))
                # 85% successfully rescued and dispatched to food banks, 15% wasted
                if random.random() < 0.85:
                    events.append({
                        "event_id": str(uuid.uuid4())[:8],
                        "batch_id": batch_id,
                        "store_id": store_id,
                        "event_type": "dispatched",
                        "timestamp": terminal_time.strftime("%Y-%m-%dT%H:%M:%S+08:00"),
                        "quantity": f"{remaining_surplus:.1f}",
                        "metadata": json.dumps({
                            "target_receiver": "Klang Valley Food Bank Hub",
                            "routing_engine": "OSRM Smart Dispatch",
                            "value_rescued_myr": round(remaining_surplus * unit_price, 2),
                            "esg_metric": "Food Waste Avoided"
                        })
                    })
                else:
                    events.append({
                        "event_id": str(uuid.uuid4())[:8],
                        "batch_id": batch_id,
                        "store_id": store_id,
                        "event_type": "wasted",
                        "timestamp": terminal_time.strftime("%Y-%m-%dT%H:%M:%S+08:00"),
                        "quantity": f"{remaining_surplus:.1f}",
                        "metadata": json.dumps({
                            "loss_reason": "Biological Expiration Exceeded",
                            "loss_value_myr": round(remaining_surplus * unit_price, 2),
                            "destination": "Municipal Organic Waste Composting"
                        })
                    })

    # Sort events chronologically
    events.sort(key=lambda x: x["timestamp"])

    # Export to output paths
    fieldnames = ["event_id", "batch_id", "store_id", "event_type", "timestamp", "quantity", "metadata"]
    for path in (output_path, mirror_path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(events)
        print(f"[SIMULATOR] Exported {len(events)} events to: {path}")

    return events


if __name__ == "__main__":
    run_discrete_event_simulation()

