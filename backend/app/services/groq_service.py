"""
GoldSense Backend — Groq LLM Service
Handles AI chatbot responses and personalized investment recommendations.
"""

import json
import logging
from typing import Optional
from groq import Groq

from app.config import settings

logger = logging.getLogger(__name__)

CHATBOT_MODEL = "llama-3.3-70b-versatile"
RECOMMENDATION_MODEL = "llama-3.3-70b-versatile"

# Max tokens for responses
CHATBOT_MAX_TOKENS = 800
RECOMMENDATION_MAX_TOKENS = 600


def _get_client() -> Groq:
    return Groq(api_key=settings.groq_api_key)


def _build_gold_context(prediction: dict, forecast: list) -> str:
    """Build a gold market context string for the LLM system prompt."""
    tomorrow = prediction
    trend_emoji = "↑" if tomorrow.get("trend") == "up" else "↓" if tomorrow.get("trend") == "down" else "→"

    week_summary = ""
    if forecast:
        prices = [f["usd"] for f in forecast]
        week_low = min(prices)
        week_high = max(prices)
        week_summary = f"7-day forecast range: ${week_low:,.2f} – ${week_high:,.2f}"

    return f"""Current Gold Market Data:
- Tomorrow's predicted price: ${tomorrow.get('tomorrow_usd', 'N/A'):,.2f}/oz (USD)
- Last actual price: ${tomorrow.get('last_actual_usd', 'N/A'):,.2f}/oz
- Trend: {trend_emoji} {tomorrow.get('trend', 'unknown').upper()} ({tomorrow.get('pct_change', 0):+.2f}%)
- USD/INR Rate: ₹{tomorrow.get('usd_inr_rate', 'N/A')}
- Chennai 24k gold (predicted tomorrow): ₹{tomorrow.get('tomorrow_price_24k_per_gram', 'N/A'):,.2f}/gram
- Chennai 22k gold (predicted tomorrow): ₹{tomorrow.get('tomorrow_price_22k_per_gram', 'N/A'):,.2f}/gram
- {week_summary}
- Model accuracy (MAPE): {tomorrow.get('model_mape', 0):.2f}%"""


def _build_user_context(profile: Optional[dict]) -> str:
    """Build user investment profile context."""
    if not profile:
        return "User profile: Not set up yet."

    parts = []
    if profile.get("full_name"):
        parts.append(f"User: {profile['full_name']}")
    if profile.get("gold_holdings_grams"):
        parts.append(f"Gold holdings: {profile['gold_holdings_grams']}g (₹{profile.get('gold_holdings_value_inr', 0):,.0f})")
    if profile.get("monthly_budget_inr"):
        parts.append(f"Monthly investment budget: ₹{profile['monthly_budget_inr']:,.0f}")
    if profile.get("investment_goal"):
        parts.append(f"Investment goal: {profile['investment_goal'].replace('_', ' ')}")
    if profile.get("risk_appetite"):
        parts.append(f"Risk appetite: {profile['risk_appetite']}")
    if profile.get("preferred_gold_forms"):
        parts.append(f"Preferred gold forms: {', '.join(profile['preferred_gold_forms'])}")
    if profile.get("target_savings_inr"):
        parts.append(f"Target savings: ₹{profile['target_savings_inr']:,.0f}")

    return "User Investment Profile:\n" + "\n".join(f"- {p}" for p in parts)


CHATBOT_SYSTEM_PROMPT = """You are GoldSense AI — an expert financial assistant specializing in gold investments for Indian investors, particularly in Chennai.

Your expertise includes:
- Gold price analysis and prediction interpretation
- Indian gold market (22k/24k jewellery, coins, ETFs, Sovereign Gold Bonds)
- Import duties, GST, making charges in India
- Gold as an investment vs inflation, currency hedging
- RBI guidelines on gold investment
- Timing strategies for buying/selling gold

Guidelines:
- Give specific, actionable advice tailored to the user's profile
- Always mention that predictions are AI estimates, not financial guarantees
- Keep responses concise (3-5 sentences for most answers)
- Use ₹ for Indian rupees and $ for USD
- Be encouraging but realistic about risks
- If asked about specific stock tips or non-gold investments, politely redirect to gold topics

{gold_context}

{user_context}"""


RECOMMENDATION_SYSTEM_PROMPT = """You are a gold investment advisor AI. Analyze the user's profile and current gold market data to provide a clear, personalized investment recommendation.

Return your recommendation as a JSON object with this exact structure:
{{
  "action": "BUY" | "HOLD" | "SELL" | "WAIT",
  "confidence": 1-10,
  "title": "Short action title (max 8 words)",
  "reasoning": "2-3 sentence explanation",
  "key_factors": ["factor1", "factor2", "factor3"],
  "suggested_amount_inr": null or number (monthly investment suggestion),
  "best_form": "Jewellery" | "Coins" | "Gold ETF" | "Digital Gold" | "Sovereign Gold Bond",
  "timeframe": "Short-term" | "Medium-term" | "Long-term",
  "risk_note": "One sentence about relevant risks"
}}

{gold_context}

{user_context}"""


def get_chatbot_response(
    messages: list[dict],
    prediction: dict,
    forecast: list,
    user_profile: Optional[dict] = None,
) -> str:
    """
    Generate a chatbot response using Groq LLM.

    Args:
        messages: Conversation history [{"role": "user"|"assistant", "content": "..."}]
        prediction: Tomorrow's prediction data
        forecast: 7-day forecast list
        user_profile: User's investment profile from Supabase

    Returns:
        Assistant's response text
    """
    client = _get_client()

    gold_ctx = _build_gold_context(prediction, forecast)
    user_ctx = _build_user_context(user_profile)

    system_content = CHATBOT_SYSTEM_PROMPT.format(
        gold_context=gold_ctx,
        user_context=user_ctx,
    )

    # Build messages list with system prompt
    all_messages = [{"role": "system", "content": system_content}]

    # Add conversation history (last 10 exchanges to stay within context)
    all_messages.extend(messages[-20:])

    try:
        response = client.chat.completions.create(
            model=CHATBOT_MODEL,
            messages=all_messages,
            max_tokens=CHATBOT_MAX_TOKENS,
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Groq chatbot error: {e}")
        return "I'm having trouble connecting right now. Please try again in a moment."


def get_investment_recommendation(
    prediction: dict,
    forecast: list,
    user_profile: dict,
) -> dict:
    """
    Generate personalized buy/sell/hold recommendation using Groq LLM.

    Returns:
        dict with action, confidence, reasoning, key_factors, etc.
    """
    client = _get_client()

    gold_ctx = _build_gold_context(prediction, forecast)
    user_ctx = _build_user_context(user_profile)

    system_content = RECOMMENDATION_SYSTEM_PROMPT.format(
        gold_context=gold_ctx,
        user_context=user_ctx,
    )

    user_message = (
        f"Based on the current gold market data and my investment profile, "
        f"provide a detailed investment recommendation. "
        f"Consider the predicted trend ({prediction.get('trend', 'unknown')}) "
        f"and my risk appetite ({user_profile.get('risk_appetite', 'not specified')})."
    )

    try:
        response = client.chat.completions.create(
            model=RECOMMENDATION_MODEL,
            messages=[
                {"role": "system", "content": system_content},
                {"role": "user", "content": user_message},
            ],
            max_tokens=RECOMMENDATION_MAX_TOKENS,
            temperature=0.3,  # Lower temperature for more consistent recommendations
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content.strip()
        return json.loads(content)

    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error in recommendation: {e}")
        return _default_recommendation(prediction)
    except Exception as e:
        logger.error(f"Groq recommendation error: {e}")
        return _default_recommendation(prediction)


def _default_recommendation(prediction: dict) -> dict:
    """Fallback recommendation when LLM fails."""
    trend = prediction.get("trend", "stable")
    action = "BUY" if trend == "down" else "HOLD" if trend == "stable" else "WAIT"
    return {
        "action": action,
        "confidence": 5,
        "title": "Monitor market conditions",
        "reasoning": "Based on current price trends, consider monitoring the market before making a decision.",
        "key_factors": ["Price trend", "Market volatility", "USD/INR rate"],
        "suggested_amount_inr": None,
        "best_form": "Gold ETF",
        "timeframe": "Medium-term",
        "risk_note": "Gold prices are subject to global market conditions and currency fluctuations.",
    }
