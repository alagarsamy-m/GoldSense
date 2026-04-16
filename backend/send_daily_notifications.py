"""
CLI entrypoint for sending daily GoldSense push notifications.
"""

from __future__ import annotations

import json
import sys

from app.services.gold_service import GoldService
from app.services.notification_service import send_daily_prediction_notifications


if __name__ == "__main__":
    try:
        prediction = GoldService.get_tomorrow_prediction()
        result = send_daily_prediction_notifications(prediction)
        payload = {"ok": True, **result}
        print(json.dumps(payload, indent=2), flush=True)
        sys.exit(0)
    except Exception as exc:
        payload = {
            "ok": False,
            "sent": 0,
            "failed": 0,
            "status": "error",
            "reason": str(exc),
        }
        print(json.dumps(payload, indent=2), flush=True)
        raise
