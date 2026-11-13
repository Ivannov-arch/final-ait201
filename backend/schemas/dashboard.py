from pydantic import BaseModel


class DashboardSummary(BaseModel):
    status: str
    is_mock_data: bool
    total_batches: int
    total_food_items: int
    total_food_rescued: float
    total_food_wasted: float
    forecast_status: str