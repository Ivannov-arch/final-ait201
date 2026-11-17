from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Any


class Batch(BaseModel):
    model_config = ConfigDict(extra="allow")

    batch_id: str
    food_name: str
    quantity: float
    unit: str = "units"
    status: str = "Available"
    category: str = "Produce"
    unit_price_myr: float = 5.0
    days_to_expiry: int = 5
    risk_tier: Optional[str] = "low"
    risk_label: Optional[str] = "Low Risk"
    risk_score: Optional[float] = None
    risk_source: Optional[str] = None
    shelf_life_days: Optional[float] = 14.0
    turnover_ratio: Optional[float] = 2.0
    stock_pressure: Optional[float] = 1.0

    # Frontend-specific alias fields for backward & cross-compatibility
    id: Optional[str] = None
    product: Optional[str] = None
    stockQty: Optional[float] = None
    qty: Optional[str] = None
    uom: Optional[str] = None
    sellPrice: Optional[str] = None
    costPrice: Optional[str] = None
    unitPrice: Optional[float] = None
    expiryDate: Optional[str] = None
    dateIn: Optional[str] = None
    dteNum: Optional[int] = None
    dte: Optional[str] = None
    risk: Optional[str] = None
    riskType: Optional[str] = None
    reorderLevel: Optional[int] = 15
    reorderQuantity: Optional[int] = 20
    isPromoted: Optional[int] = 0


class BatchResponse(BaseModel):
    status: str
    is_mock_data: bool
    total_batches: int
    batches: List[Batch]
