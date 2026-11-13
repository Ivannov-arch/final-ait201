from fastapi import APIRouter, Body
from typing import Dict, Any

from backend.schemas.batch import BatchResponse
from backend.services.batch_service import get_batches, save_batch_to_csv


router = APIRouter(
    prefix="/api/batches",
    tags=["Food Batches"]
)


@router.get("/", response_model=BatchResponse)
def read_batches():
    return get_batches()


@router.post("/")
def create_batch(batch_data: Dict[str, Any] = Body(...)):
    """
    Persists a newly registered inventory batch directly into inventory_master.csv.
    """
    return save_batch_to_csv(batch_data)
