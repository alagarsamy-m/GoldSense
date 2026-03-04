"""
GoldSense Backend — Supabase Service
Handles database operations and JWT authentication.
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import create_client, Client

from app.config import settings

logger = logging.getLogger(__name__)

security = HTTPBearer()

_supabase_client: Optional[Client] = None


def get_supabase() -> Client:
    """Get or create Supabase client (service role for backend operations)."""
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = create_client(
            settings.supabase_url,
            settings.supabase_service_key,
        )
    return _supabase_client


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> dict:
    """
    Dependency: Validate Supabase JWT and return user info.
    Raises 401 if token is invalid or expired.
    """
    token = credentials.credentials
    supabase = get_supabase()

    try:
        response = supabase.auth.get_user(token)
        if response.user is None:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return {
            "id": response.user.id,
            "email": response.user.email,
            "metadata": response.user.user_metadata,
        }
    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")


class UserProfileService:
    """Database operations for user profiles."""

    @staticmethod
    def get_profile(user_id: str) -> Optional[dict]:
        supabase = get_supabase()
        try:
            response = supabase.table("user_profiles").select("*").eq("id", user_id).maybe_single().execute()
            return response.data
        except Exception as e:
            logger.warning(f"get_profile error for {user_id}: {e}")
            return None

    @staticmethod
    def upsert_profile(user_id: str, profile_data: dict) -> dict:
        supabase = get_supabase()
        profile_data["id"] = user_id
        profile_data["updated_at"] = datetime.now(timezone.utc).isoformat()

        response = (
            supabase.table("user_profiles")
            .upsert(profile_data, on_conflict="id")
            .execute()
        )
        return response.data[0] if response.data else {}


class ChatHistoryService:
    """Database operations for chat history."""

    @staticmethod
    def get_recent_history(user_id: str, limit: int = 20) -> list:
        supabase = get_supabase()
        response = (
            supabase.table("chat_history")
            .select("role, content, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        # Return in chronological order, only role+content (strip created_at)
        rows = [{"role": r["role"], "content": r["content"]} for r in (response.data or [])]
        return list(reversed(rows))

    @staticmethod
    def save_messages(user_id: str, user_message: str, assistant_response: str):
        supabase = get_supabase()
        rows = [
            {"user_id": user_id, "role": "user", "content": user_message},
            {"user_id": user_id, "role": "assistant", "content": assistant_response},
        ]
        supabase.table("chat_history").insert(rows).execute()
