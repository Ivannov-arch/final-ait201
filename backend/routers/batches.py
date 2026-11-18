from fastapi import APIRouter, Body, HTTPException
from typing import Dict, Any, Union, List

from backend.schemas.batch import BatchResponse, Batch
from backend.services.batch_service import (
    get_batches,
    get_batch_by_id,
    save_batch_to_csv,
    update_batch,
    delete_batch,
    predict_live_spoilage
)


router = APIRouter(
    tags=["Food Batches"]
)


@router.get("/api/batches", response_model=Union[BatchResponse, List[Batch]])
@router.get("/api/lots", response_model=Union[BatchResponse, List[Batch]])
def read_batches(as_list: bool = False):
    """
    Returns active store inventory batches sorted by FEFO (First-Expired, First-Out).
    Supports both wrapped BatchResponse and plain List[Batch] for frontend convenience.
    """
    res = get_batches()
    if as_list and isinstance(res, dict) and "batches" in res:
        return res["batches"]
    return res


@router.get("/api/batches/{batch_id}", response_model=Batch)
@router.get("/api/lots/{batch_id}", response_model=Batch)
def read_single_batch(batch_id: str):
    """
    Returns granular batch details for a specific lot_id.
    """
    batch = get_batch_by_id(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    return batch


@router.post("/api/batches")
@router.post("/api/lots")
def create_batch(batch_data: Dict[str, Any] = Body(...)):
    """
    Persists a newly registered inventory batch directly into inventory_master.csv
    and computes ML spoilage risk using Person 1's XGBoost champion model.
    """
    return save_batch_to_csv(batch_data)


@router.post("/api/spoilage/predict")
def live_spoilage_prediction(batch_data: Dict[str, Any] = Body(...)):
    """
    Live on-the-fly XGBoost spoilage risk prediction for form modal preview.
    Evaluates promotion toggle, category, stock pressure, and calendar DTE.
    """
    return predict_live_spoilage(batch_data)


@router.patch("/api/batches/{batch_id}")
def patch_batch(batch_id: str, updates: Dict[str, Any] = Body(...)):
    """Updates batch fields (quantity, price, expiry, etc.) in master inventory."""
    res = update_batch(batch_id, updates)
    if not res:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    return res


@router.delete("/api/batches/{batch_id}")
def remove_batch(batch_id: str):
    """Deletes a batch from master inventory."""
    res = delete_batch(batch_id)
    if not res:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    return res

