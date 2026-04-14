"""
CLI entrypoint for sending daily GoldSense push notifications.
"""

from __future__ import annotations

import json

from app.services.gold_service import GoldService
from app.services.notification_service import send_daily_prediction_notifications


if __name__ == "__main__":
    prediction = GoldService.get_tomorrow_prediction()
    result = send_daily_prediction_notifications(prediction)
    print(json.dumps(result, indent=2))
