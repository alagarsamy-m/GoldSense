"""
GoldSense Backend — FastAPI Application Entry Point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.config import settings
from app.routers import prediction, user, chatbot

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("GoldSense API starting up...")
    # Pre-load the model on startup to reduce first-request latency
    from app.services.gold_service import GoldService
    try:
        GoldService.preload()
        logger.info("ML model loaded successfully")
    except Exception as e:
        logger.warning(f"Could not preload model: {e}")
    yield
    logger.info("GoldSense API shutting down...")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="AI-powered gold price forecasting API",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(prediction.router, prefix="/api/prediction", tags=["Prediction"])
app.include_router(user.router, prefix="/api/user", tags=["User"])
app.include_router(chatbot.router, prefix="/api/chatbot", tags=["Chatbot"])


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint for Cloud Run."""
    from app.services.gold_service import GoldService
    model_info = GoldService.get_model_info()
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": settings.app_version,
        "model_loaded": model_info.get("loaded", False),
        "model_trained_at": model_info.get("trained_at", "unknown"),
    }


@app.get("/", tags=["Health"])
async def root():
    return {"message": "GoldSense API", "docs": "/docs", "health": "/health"}
