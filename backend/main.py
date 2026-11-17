from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers.forecast import router as forecast_router
from backend.routers.batches import router as batches_router
from backend.routers.dashboard import router as dashboard_router
from backend.routers.recommend import router as recommend_router
from backend.routers.dispatch import router as dispatch_router
from backend.routers.transactions import router as transactions_router


app = FastAPI(
    title="FreshGuard API",
    description="Food demand forecasting and food waste management API",
    version="1.0.0"
)


# ==========================================
# CORS CONFIGURATION
# ==========================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


# ==========================================
# REGISTER API ROUTERS
# ==========================================

app.include_router(forecast_router)
app.include_router(batches_router)
app.include_router(dashboard_router)
app.include_router(recommend_router)
app.include_router(dispatch_router)
app.include_router(transactions_router)


# ==========================================
# ROOT ENDPOINT
# ==========================================

@app.get("/")
def root():

    return {
        "status": "success",
        "message": "FreshGuard API is running"
    }


# ==========================================
# HEALTH CHECK
# ==========================================

@app.get("/health")
def health_check():

    return {
        "status": "healthy"
    }