from fastapi import APIRouter

from backend.schemas.dashboard import DashboardSummary
from backend.services.dashboard_service import (
    get_dashboard_summary
)


router = APIRouter(
    prefix="/api/dashboard",
    tags=["Dashboard"]
)


@router.get("/summary", response_model=DashboardSummary)
def read_dashboard_summary():

    return get_dashboard_summary()