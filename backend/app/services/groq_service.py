"""
Groq-backed conversational and explanation layer.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from groq import Groq

from app.config import settings
from app.services.recommendation_engine import build_recommendation_context

logger = logging.getLogger(__name__)

CHATBOT_MODEL = "llama-3.3-70b-versatile"
RECOMMENDATION_MODEL = "llama-3.3-70b-versatile"
CHATBOT_MAX_TOKENS = 800
RECOMMENDATION_MAX_TOKENS = 700


def _get_client() -> Groq:
    return Groq(api_key=settings.groq_api_key)


def _build_gold_context(prediction: dict, forecast: list) -> str:
    trend = prediction.get("direction_vs_today", prediction.get("trend", "stable"))
    trend_icon = "up" if trend == "up" else "down" if trend == "down" else "stable"
    trading_rows = [row for row in forecast if row.get("is_trading_day")]
    if trading_rows:
        week_low = min(row["usd"] for row in trading_rows)
        week_high = max(row["usd"] for row in trading_rows)
        week_summary = f"Current-week trading range in the forecast: ${week_low:,.2f} to ${week_high:,.2f}"
    else:
        week_summary = "Current-week trading range unavailable."

    return f"""Current Gold Market Data:
- Tomorrow estimated close: ${prediction.get('tomorrow_usd', 0):,.2f}/oz
- Today's live reference: ${prediction.get('reference_live_usd', 0):,.2f}/oz
- Signal vs today: {trend_icon} {trend.upper()} ({prediction.get('direction_delta_pct', 0):+.2f}%)
- USD/INR rate: Rs {prediction.get('usd_inr_rate', 'N/A')}
- 24k estimate: Rs {prediction.get('tomorrow_price_24k_per_gram', 0):,.2f}/gram
- 22k estimate: Rs {prediction.get('tomorrow_price_22k_per_gram', 0):,.2f}/gram
- {week_summary}
- Realized/backtested MAPE: {prediction.get('model_mape', 0):.2f}%
- Reference source label: {prediction.get('reference_source', prediction.get('source', 'unknown'))} ({prediction.get('reference_market_status', prediction.get('market_status', 'unknown'))})"""


def _build_user_context(profile: Optional[dict]) -> str:
    if not profile:
        return "User profile: not set up."

    parts = []
    if profile.get("full_name"):
        parts.append(f"User: {profile['full_name']}")
    if profile.get("gold_holdings_grams") is not None:
        parts.append(f"Gold holdings: {profile.get('gold_holdings_grams', 0)}g")
    if profile.get("monthly_budget_inr"):
        parts.append(f"Monthly budget: Rs {profile['monthly_budget_inr']:,.0f}")
    if profile.get("investment_goal"):
        parts.append(f"Investment goal: {profile['investment_goal'].replace('_', ' ')}")
    if profile.get("risk_appetite"):
        parts.append(f"Risk appetite: {profile['risk_appetite']}")
    if profile.get("preferred_gold_forms"):
        parts.append(f"Preferred forms: {', '.join(profile['preferred_gold_forms'])}")
    if profile.get("target_savings_inr"):
        parts.append(f"Target savings: Rs {profile['target_savings_inr']:,.0f}")

    return "User Investment Profile:\n" + "\n".join(f"- {item}" for item in parts)


CHATBOT_SYSTEM_PROMPT = """You are GoldSense AI, a concise gold-market assistant for Indian users.

Rules:
- Treat today's price as a live or delayed reference price, not as a guaranteed final close.
- Treat tomorrow's forecast as an estimated calendar-day close, not a guarantee.
- Prefer practical advice: allocation, timing discipline, instrument choice, and risk framing.
- Keep normal answers to 3-6 sentences.
- Use rupees and dollars plainly.

{gold_context}

{user_context}"""


RECOMMENDATION_SYSTEM_PROMPT = """You are a gold investment advisor AI.

Return JSON only with this structure:
{{
  "action": "BUY" | "HOLD" | "SELL" | "WAIT",
  "confidence": 1-10,
  "title": "Short action title",
  "reasoning": "2-3 sentence explanation",
  "key_factors": ["factor1", "factor2", "factor3"],
  "suggested_amount_inr": null or number,
  "best_form": "Jewellery" | "Coins" | "Gold ETF" | "Digital Gold" | "Sovereign Gold Bond",
  "timeframe": "Short-term" | "Medium-term" | "Long-term",
  "risk_note": "One sentence about relevant risks",
  "strategy": "Steady SIP" | "Guarded Entry" | "Staggered DCA" | "DCA",
  "target_allocation_pct": "5-10%" | "10-15%" | "15-20%",
  "entry_band_24k_per_gram": {{
    "lower_24k_per_gram": number,
    "upper_24k_per_gram": number
  }},
  "alert_reason": "Short alert reason",
  "risk_flags": ["flag1", "flag2"]
}}

Use the deterministic baseline below as the primary decision anchor. You may improve wording, but do not contradict the baseline without a strong reason.

{gold_context}

{user_context}

Deterministic baseline:
{engine_context}"""


def get_chatbot_response(
    messages: list[dict],
    prediction: dict,
    forecast: list,
    user_profile: Optional[dict] = None,
) -> str:
    client = _get_client()
    system_content = CHATBOT_SYSTEM_PROMPT.format(
        gold_context=_build_gold_context(prediction, forecast),
        user_context=_build_user_context(user_profile),
    )
    all_messages = [{"role": "system", "content": system_content}]
    all_messages.extend(messages[-20:])

    try:
        response = client.chat.completions.create(
            model=CHATBOT_MODEL,
            messages=all_messages,
            max_tokens=CHATBOT_MAX_TOKENS,
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()
    except Exception as exc:
        logger.error("Groq chatbot error: %s", exc)
        return "I can't reach the advisory model right now. Please try again shortly."


def get_investment_recommendation(prediction: dict, forecast: list, user_profile: dict) -> dict:
    deterministic = build_recommendation_context(prediction, forecast, user_profile)
    client = _get_client()

    system_content = RECOMMENDATION_SYSTEM_PROMPT.format(
        gold_context=_build_gold_context(prediction, forecast),
        user_context=_build_user_context(user_profile),
        engine_context=json.dumps(deterministic, indent=2),
    )
    user_message = (
        f"Generate a final recommendation for a user with {user_profile.get('risk_appetite', 'unknown')} risk appetite "
        f"and {user_profile.get('investment_goal', 'unspecified')} goal. Keep it practical."
    )

    try:
        response = client.chat.completions.create(
            model=RECOMMENDATION_MODEL,
            messages=[
                {"role": "system", "content": system_content},
                {"role": "user", "content": user_message},
            ],
            max_tokens=RECOMMENDATION_MAX_TOKENS,
            temperature=0.25,
            response_format={"type": "json_object"},
        )
        parsed = json.loads(response.choices[0].message.content.strip())
        merged = {**deterministic, **parsed}
        merged["key_factors"] = parsed.get("key_factors") or deterministic["key_factors"]
        merged["risk_flags"] = parsed.get("risk_flags") or deterministic["risk_flags"]
        merged["entry_band_24k_per_gram"] = parsed.get("entry_band_24k_per_gram") or deterministic["entry_band_24k_per_gram"]
        return merged
    except Exception as exc:
        logger.error("Groq recommendation error: %s", exc)
        return deterministic
