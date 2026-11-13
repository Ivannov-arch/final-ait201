from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from src.forecasting.forecast_service import (
    get_three_day_forecast,
    get_forecast_by_horizon,
    get_forecast_by_store,
    get_product_forecast,
    get_all_products_forecast
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


@router.get("/products")
def get_products_forecast(store_nbr: int = 1, limit: int = 30):
    """
    Returns disaggregated 3-day demand forecast projections and recommended actions
    for top inventory products, directly formatted for frontend consumption.
    """
    try:
        return get_all_products_forecast(store_nbr=store_nbr, limit=limit)
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error)
        )


@router.get("/product/{product_name}")
def get_single_product_forecast(product_name: str, store_nbr: int = 1):
    """
    Returns granular 3-day projection for a specific product item,
    matching category velocity to batch stock levels.
    """
    try:
        return get_product_forecast(product_name=product_name, store_nbr=store_nbr)
    except ValueError as error:
        raise HTTPException(
            status_code=404,
            detail=str(error)
        )
    except Exception as error:
        raise HTTPException(
            status_code=500,
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
