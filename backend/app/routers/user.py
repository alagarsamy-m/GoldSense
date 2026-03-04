"""
GoldSense Backend — User Router
Protected endpoints for user profile and personalized recommendations.
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.services.supabase_service import get_current_user, UserProfileService
from app.services.groq_service import get_investment_recommendation
from app.services.gold_service import GoldService

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    city: Optional[str] = "Chennai"
    gold_holdings_grams: Optional[float] = Field(None, ge=0)
    gold_holdings_value_inr: Optional[float] = Field(None, ge=0)
    monthly_budget_inr: Optional[float] = Field(None, ge=0)
    investment_goal: Optional[str] = Field(
        None, pattern="^(short_term|long_term|both)$"
    )
    risk_appetite: Optional[str] = Field(
        None, pattern="^(conservative|moderate|aggressive)$"
    )
    preferred_gold_forms: Optional[List[str]] = None
    target_savings_inr: Optional[float] = Field(None, ge=0)
    profile_complete: Optional[bool] = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    """Get the authenticated user's investment profile."""
    profile = UserProfileService.get_profile(current_user["id"])
    if not profile:
        # Return empty profile template
        return {
            "id": current_user["id"],
            "email": current_user["email"],
            "profile_complete": False,
        }
    return profile


@router.put("/profile")
async def update_profile(
    profile_data: UserProfileUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Create or update the authenticated user's investment profile."""
    update_dict = profile_data.model_dump(exclude_none=True)

    # Mark profile as complete only when ALL required fields are actually present
    # (either in this update or already saved in DB — fetch existing once, not per field)
    required_fields = ["investment_goal", "risk_appetite", "monthly_budget_inr"]
    existing = UserProfileService.get_profile(current_user["id"]) or {}
    if all(update_dict.get(f) or existing.get(f) for f in required_fields):
        update_dict["profile_complete"] = True

    updated = UserProfileService.upsert_profile(current_user["id"], update_dict)
    return updated


@router.get("/recommendations")
async def get_recommendations(current_user: dict = Depends(get_current_user)):
    """
    Get personalized buy/sell/hold recommendation based on:
    - Current gold price prediction
    - User's investment profile (risk appetite, budget, goal, holdings)
    Powered by Groq LLM (Llama 3.3 70B).
    """
    profile = UserProfileService.get_profile(current_user["id"])
    if not profile or not profile.get("profile_complete"):
        raise HTTPException(
            status_code=400,
            detail="Please complete your investment profile first to get personalized recommendations."
        )

    try:
        prediction = GoldService.get_tomorrow_prediction()
        forecast = GoldService.get_week_forecast()
        recommendation = get_investment_recommendation(prediction, forecast, profile)
        return {
            "recommendation": recommendation,
            "prediction_used": {
                "date": prediction.get("prediction_date"),
                "usd": prediction.get("tomorrow_usd"),
                "trend": prediction.get("trend"),
            }
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Could not generate recommendation: {str(e)}"
        )


@router.get("/dashboard")
async def get_dashboard(current_user: dict = Depends(get_current_user)):
    """
    Get all dashboard data in one request:
    - User profile
    - Tomorrow's prediction (personalized context)
    - Recent accuracy logs
    """
    profile = UserProfileService.get_profile(current_user["id"])

    try:
        prediction = GoldService.get_tomorrow_prediction()
        accuracy_logs = GoldService.get_accuracy_logs(limit=10)
    except Exception:
        prediction = None
        accuracy_logs = []

    # Calculate portfolio value if user has holdings
    portfolio_value_inr = None
    if profile and profile.get("gold_holdings_grams") and prediction:
        grams = profile["gold_holdings_grams"]
        price_24k = prediction.get("tomorrow_price_24k_per_gram", 0)
        portfolio_value_inr = round(grams * price_24k, 2)

    return {
        "profile": profile,
        "prediction": prediction,
        "portfolio_value_inr": portfolio_value_inr,
        "recent_accuracy": accuracy_logs,
    }
