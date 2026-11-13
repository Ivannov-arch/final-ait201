from fastapi import APIRouter, HTTPException

from src.forecasting.forecast_service import (
    get_three_day_forecast,
    get_forecast_by_horizon,
    get_forecast_by_store
)

router = APIRouter(
    prefix="/api/forecast",
    tags=["Demand Forecasting"]
)


@router.get("/")
def get_all_forecasts():

    try:
        return get_three_day_forecast()

    except FileNotFoundError as error:
        raise HTTPException(
            status_code=503,
            detail=str(error)
        )


@router.get("/horizon/{horizon}")
def get_horizon_forecast(horizon: int):

    try:
        return get_forecast_by_horizon(horizon)

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    except FileNotFoundError as error:
        raise HTTPException(
            status_code=503,
            detail=str(error)
        )


@router.get("/store/{store_nbr}")
def get_store_forecast(store_nbr: int):

    if not 1 <= store_nbr <= 54:
        raise HTTPException(
            status_code=400,
            detail="Store number must be between 1 and 54."
        )

    try:
        return get_forecast_by_store(store_nbr)

    except FileNotFoundError as error:
        raise HTTPException(
            status_code=503,
            detail=str(error)
        )