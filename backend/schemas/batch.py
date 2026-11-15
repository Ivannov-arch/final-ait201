from pydantic import BaseModel
from typing import List, Optional


class Batch(BaseModel):
    batch_id: str
    food_name: str
    quantity: float
    unit: str
    status: str
    category: str = "Produce"
    unit_price_myr: float = 5.0
    days_to_expiry: int = 5
    risk_tier: Optional[str] = "low"
    risk_label: Optional[str] = "Low Risk"
    shelf_life_days: Optional[float] = 14.0
    turnover_ratio: Optional[float] = 2.0
    stock_pressure: Optional[float] = 1.0


class BatchResponse(BaseModel):
    status: str
    is_mock_data: bool
    total_batches: int
    batches: List[Batch]
