"""
CLI entrypoint for sending daily GoldSense push notifications.
"""

from __future__ import annotations

import contextlib
import io
import json
import sys
import traceback

from app.services.gold_service import GoldService
from app.services.notification_service import send_daily_prediction_notifications


def main() -> int:
    captured_stdout = io.StringIO()
    try:
        with contextlib.redirect_stdout(captured_stdout):
            prediction = GoldService.get_tomorrow_prediction()
            result = send_daily_prediction_notifications(prediction)
        payload = {"ok": True, **result}
        print(json.dumps(payload, indent=2), flush=True)
        return 0
    except Exception as exc:
        noisy_output = captured_stdout.getvalue().strip()
        if noisy_output:
            print(noisy_output, file=sys.stderr, flush=True)
        payload = {
            "ok": False,
            "sent": 0,
            "failed": 0,
            "status": "error",
            "reason": str(exc),
        }
        print(json.dumps(payload, indent=2), flush=True)
        traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
