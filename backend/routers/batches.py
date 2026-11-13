from fastapi import APIRouter

from backend.schemas.batch import BatchResponse
from backend.services.batch_service import get_batches


router = APIRouter(
    prefix="/api/batches",
    tags=["Food Batches"]
)


@router.get("/", response_model=BatchResponse)
def read_batches():

    return get_batches()