from pydantic import BaseModel
from typing import List


class Batch(BaseModel):
    batch_id: str
    food_name: str
    quantity: float
    unit: str
    status: str
    category: str = "Produce"
    unit_price_myr: float = 5.0
    days_to_expiry: int = 5


class BatchResponse(BaseModel):
    status: str
    is_mock_data: bool
    total_batches: int
    batches: List[Batch]