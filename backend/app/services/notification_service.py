"""
Firebase Cloud Messaging helpers for GoldSense web push.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from app.config import settings
from app.services.supabase_service import PushSubscriptionService

logger = logging.getLogger(__name__)

_firebase_app = None


def _firebase_enabled() -> bool:
    return bool(
        settings.firebase_service_account_json
        or settings.firebase_service_account_path
        or (
            settings.firebase_project_id
            and settings.firebase_client_email
            and settings.firebase_private_key
        )
    )


def _load_service_account() -> dict[str, Any]:
    if settings.firebase_service_account_json:
        return json.loads(settings.firebase_service_account_json)

    if settings.firebase_service_account_path:
        service_account_path = Path(settings.firebase_service_account_path)
        if not service_account_path.exists():
            raise RuntimeError(f"Firebase service account file not found: {service_account_path}")
        with open(service_account_path, encoding="utf-8") as handle:
            return json.load(handle)

    if settings.firebase_project_id and settings.firebase_client_email and settings.firebase_private_key:
        return {
            "type": "service_account",
            "project_id": settings.firebase_project_id,
            "client_email": settings.firebase_client_email,
            "private_key": settings.firebase_private_key.replace("\\n", "\n"),
            "token_uri": "https://oauth2.googleapis.com/token",
        }

    raise RuntimeError("Firebase credentials are not configured.")


def _firebase_app_instance():
    global _firebase_app
    if _firebase_app is not None:
        return _firebase_app

    if not _firebase_enabled():
        raise RuntimeError("Firebase credentials are not configured.")

    import firebase_admin
    from firebase_admin import credentials

    service_account = _load_service_account()

    try:
        _firebase_app = firebase_admin.get_app()
    except ValueError:
        _firebase_app = firebase_admin.initialize_app(credentials.Certificate(service_account))
    return _firebase_app


def build_prediction_notification(prediction: dict[str, Any]) -> dict[str, str]:
    trend = str(prediction.get("trend", "stable")).upper()
    body = (
        f"{prediction.get('prediction_date')}: ${prediction.get('tomorrow_usd', 0):,.2f}/oz | "
        f"24k Rs {prediction.get('tomorrow_price_24k_per_gram', 0):,.0f}/g | {trend}"
    )
    return {
        "title": "GoldSense Daily Prediction",
        "body": body,
        "deep_link": f"/#predictor?date={prediction.get('prediction_date')}",
        "alert_reason": prediction.get("alert_reason", "Fresh daily forecast available."),
    }


def send_daily_prediction_notifications(prediction: dict[str, Any]) -> dict[str, int]:
    if not _firebase_enabled():
        logger.warning("Skipping notification send: Firebase credentials not configured.")
        return {"sent": 0, "failed": 0}

    app = _firebase_app_instance()
    from firebase_admin import messaging

    payload = build_prediction_notification(prediction)
    recipients = [row for row in PushSubscriptionService.list_enabled_tokens() if row.get("fcm_token")]
    if not recipients:
        return {"sent": 0, "failed": 0}

    messages = [
        messaging.Message(
            token=row["fcm_token"],
            notification=messaging.Notification(title=payload["title"], body=payload["body"]),
            webpush=messaging.WebpushConfig(
                fcm_options=messaging.WebpushFCMOptions(link=payload["deep_link"]),
                notification=messaging.WebpushNotification(
                    title=payload["title"],
                    body=payload["body"],
                    data={"alert_reason": payload["alert_reason"]},
                ),
            ),
            data={
                "type": "daily_prediction",
                "prediction_date": str(prediction.get("prediction_date")),
                "deep_link": payload["deep_link"],
                "alert_reason": payload["alert_reason"],
            },
        )
        for row in recipients
    ]

    batch = messaging.send_each(messages, app=app)
    failed_pairs = []
    for row, response in zip(recipients, batch.responses):
        if response.success:
            continue
        failed_pairs.append((row["user_id"], row["fcm_token"]))
        logger.warning("Push send failed for token: %s", response.exception)

    for user_id, token in failed_pairs:
        try:
            PushSubscriptionService.disable_subscription(user_id, token)
        except Exception:
            logger.warning("Failed to disable invalid push token for user %s", user_id)

    return {"sent": batch.success_count, "failed": batch.failure_count}
