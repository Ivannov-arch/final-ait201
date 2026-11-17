"""
Transactions Router — FreshGuard POS & Sales Log
================================================
Handles POS transaction persistence in transactions.json and optional sync
to Supabase simulation_events.
"""

import os
import json
from pathlib import Path
from typing import Dict, Any, List
from fastapi import APIRouter, Body, HTTPException

ROOT = Path(__file__).resolve().parents[2]
TXNS_JSON = ROOT / "data" / "processed" / "transactions.json"
SUPABASE_URL = os.getenv("SUPABASE_URL", os.getenv("VITE_SUPABASE_URL", ""))
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_KEY", os.getenv("VITE_SUPABASE_ANON_KEY", "")))

router = APIRouter(
    prefix="/api/transactions",
    tags=["POS Transactions"]
)


def _read_txns() -> List[Dict[str, Any]]:
    if not TXNS_JSON.exists():
        return []
    try:
        with open(TXNS_JSON, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []


def _write_txns(records: List[Dict[str, Any]]) -> None:
    TXNS_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(TXNS_JSON, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)


def _sync_to_supabase(txn: Dict[str, Any]) -> None:
    if not (SUPABASE_URL and SUPABASE_KEY and txn.get("batchId") and txn.get("batchId") != "UNKNOWN"):
        return
    try:
        import requests
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
        }
        event = {
            "event_id": f"EVT-{txn.get('id', 'TXN')}",
            "batch_id": txn.get("batchId"),
            "store_id": "MY-KL-001",
            "event_type": "markdown",
            "quantity": float(txn.get("qty", 1) or 1),
            "metadata": {
                "action": "pos_sale",
                "txn_id": txn.get("id"),
                "product": txn.get("product"),
                "unit_price": txn.get("unitPrice"),
                "total": txn.get("total"),
                "pay_method": txn.get("payMethod"),
                "discount": txn.get("discount"),
                "cashier": txn.get("cashier", "Cashier")
            }
        }
        requests.post(
            f"{SUPABASE_URL}/rest/v1/simulation_events",
            headers=headers,
            json=[event],
            timeout=3
        )
    except Exception as e:
        print(f"[Supabase Sync] simulation_events notice: {e}")


@router.get("", response_model=List[Dict[str, Any]])
@router.get("/", response_model=List[Dict[str, Any]])
def list_transactions():
    """Returns all recorded transactions from transactions.json."""
    return _read_txns()


@router.post("")
@router.post("/")
def create_transaction(txn: Dict[str, Any] = Body(...)):
    """Saves a new POS transaction to transactions.json and syncs to Supabase."""
    records = _read_txns()
    txn_id = txn.get("id")
    idx = next((i for i, r in enumerate(records) if r.get("id") == txn_id), -1)

    if idx >= 0:
        records[idx] = txn
    else:
        records.insert(0, txn)

    _write_txns(records)
    _sync_to_supabase(txn)

    return {"status": "saved", "id": txn_id}


@router.patch("/{txn_id}")
def update_transaction(txn_id: str, updates: Dict[str, Any] = Body(...)):
    """Updates status or details of an existing transaction."""
    records = _read_txns()
    idx = next((i for i, r in enumerate(records) if str(r.get("id")) == str(txn_id)), -1)

    if idx < 0:
        raise HTTPException(status_code=404, detail=f"Transaction {txn_id} not found")

    records[idx].update(updates)
    _write_txns(records)

    return {"status": "updated", "id": txn_id}


@router.delete("/{txn_id}")
def delete_transaction(txn_id: str):
    """Deletes a transaction by ID."""
    records = _read_txns()
    filtered = [r for r in records if str(r.get("id")) != str(txn_id)]

    if len(filtered) == len(records):
        raise HTTPException(status_code=404, detail=f"Transaction {txn_id} not found")

    _write_txns(filtered)
    return {"status": "deleted", "id": txn_id}
