from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers.forecast import router as forecast_router
from backend.routers.batches import router as batches_router
from backend.routers.dashboard import router as dashboard_router


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
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
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