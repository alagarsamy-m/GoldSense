"""
GoldSense Backend — Chatbot Router
Protected endpoint for AI chatbot powered by Groq LLM.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.services.supabase_service import get_current_user, UserProfileService, ChatHistoryService
from app.services.groq_service import get_chatbot_response
from app.services.gold_service import GoldService

router = APIRouter()


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., min_length=1, max_length=30)
    include_history: bool = True


@router.post("/message")
async def chat(
    request: ChatRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Send a message to the GoldSense AI chatbot.

    The chatbot is context-aware — it knows:
    - Current gold price prediction and trend
    - 7-day forecast
    - User's investment profile

    Send full conversation history in messages[] for multi-turn conversations.
    """
    user_id = current_user["id"]

    # Get context data
    try:
        prediction = GoldService.get_tomorrow_prediction()
        forecast = GoldService.get_week_forecast()
    except Exception:
        prediction = {}
        forecast = []

    profile = UserProfileService.get_profile(user_id)

    # Build messages for LLM
    messages = [{"role": m.role, "content": m.content} for m in request.messages]

    # Optionally prepend stored history
    if request.include_history and len(messages) <= 2:
        stored_history = ChatHistoryService.get_recent_history(user_id, limit=10)
        if stored_history:
            messages = stored_history + messages

    try:
        response_text = get_chatbot_response(
            messages=messages,
            prediction=prediction,
            forecast=forecast,
            user_profile=profile,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chatbot error: {str(e)}")

    # Save to history
    if messages and messages[-1]["role"] == "user":
        try:
            ChatHistoryService.save_messages(
                user_id=user_id,
                user_message=messages[-1]["content"],
                assistant_response=response_text,
            )
        except Exception:
            pass  # Don't fail the request if history save fails

    return {
        "response": response_text,
        "context": {
            "prediction_date": prediction.get("prediction_date"),
            "gold_trend": prediction.get("trend"),
        },
    }


@router.get("/history")
async def get_chat_history(
    limit: int = 20,
    current_user: dict = Depends(get_current_user),
):
    """Get the authenticated user's recent chat history."""
    history = ChatHistoryService.get_recent_history(current_user["id"], limit=limit)
    return {"history": history}


@router.delete("/history")
async def clear_chat_history(current_user: dict = Depends(get_current_user)):
    """Clear the authenticated user's chat history."""
    from app.services.supabase_service import get_supabase
    supabase = get_supabase()
    supabase.table("chat_history").delete().eq("user_id", current_user["id"]).execute()
    return {"message": "Chat history cleared"}
