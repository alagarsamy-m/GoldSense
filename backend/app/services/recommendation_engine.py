"""
Hybrid recommendation engine for GoldSense.

Deterministic portfolio logic produces a structured recommendation. The LLM can
then explain or refine the wording, but the core decision remains rule-based.
"""

from __future__ import annotations

from typing import Any


RISK_ALLOCATION = {
    "conservative": "5-10%",
    "moderate": "10-15%",
    "aggressive": "15-20%",
}


def _preferred_instrument(profile: dict[str, Any]) -> str:
    preferred = profile.get("preferred_gold_forms") or []
    goal = profile.get("investment_goal")
    if preferred:
        return preferred[0]
    if goal == "long_term":
        return "Sovereign Gold Bond"
    if goal == "short_term":
        return "Gold ETF"
    return "Digital Gold"


def _strategy_label(profile: dict[str, Any], prediction: dict[str, Any]) -> str:
    pct_change = abs(float(prediction.get("pct_change", 0)))
    budget = float(profile.get("monthly_budget_inr") or 0)
    if pct_change >= 1.0 and budget > 0:
        return "Staggered DCA"
    if pct_change < 0.4:
        return "Steady SIP"
    return "Guarded Entry"


def build_recommendation_context(
    prediction: dict[str, Any],
    forecast: list[dict[str, Any]],
    user_profile: dict[str, Any],
) -> dict[str, Any]:
    risk = user_profile.get("risk_appetite", "moderate")
    budget = float(user_profile.get("monthly_budget_inr") or 0)
    holdings = float(user_profile.get("gold_holdings_grams") or 0)
    trend = prediction.get("direction_vs_today", prediction.get("trend", "stable"))
    pct_change = float(prediction.get("direction_delta_pct", prediction.get("pct_change", 0)) or 0)
    confidence = float(prediction.get("direction_confidence") or 55)
    weekly_rows = [row for row in forecast if row.get("status") == "forecast" and row.get("is_trading_day")]
    weekly_end_usd = weekly_rows[-1]["usd"] if weekly_rows else prediction.get("tomorrow_usd")
    weekly_delta = float(weekly_end_usd or prediction.get("tomorrow_usd", 0)) - float(prediction.get("tomorrow_usd", 0))

    if trend == "down" and pct_change <= -0.4:
        action = "BUY"
        title = "Buy the dip gradually"
        amount_ratio = 0.75 if risk == "aggressive" else 0.5
    elif trend == "up" and holdings > 0 and user_profile.get("investment_goal") == "short_term":
        action = "SELL"
        title = "Consider partial profit booking"
        amount_ratio = 0.0
    elif trend == "up":
        action = "WAIT"
        title = "Wait for a better entry"
        amount_ratio = 0.25
    else:
        action = "HOLD"
        title = "Stay disciplined with accumulation"
        amount_ratio = 0.4

    suggested_amount = round(budget * amount_ratio, -2) if budget and amount_ratio else None
    best_form = _preferred_instrument(user_profile)
    target_allocation = RISK_ALLOCATION.get(risk, RISK_ALLOCATION["moderate"])
    strategy = _strategy_label(user_profile, prediction)

    ci = prediction.get("confidence_interval", {}) or {}
    entry_band = {
        "lower_24k_per_gram": ci.get("lower_24k_per_gram") or prediction.get("tomorrow_price_24k_per_gram"),
        "upper_24k_per_gram": ci.get("upper_24k_per_gram") or prediction.get("tomorrow_price_24k_per_gram"),
    }

    key_factors = [
        f"Tomorrow trend: {trend}",
        f"Projected move vs today: {pct_change:+.2f}%",
        f"Weekly follow-through: {weekly_delta:+.2f} USD/oz",
        f"Risk appetite: {risk}",
    ]

    risk_flags = []
    if confidence < 58:
        risk_flags.append("Direction confidence is modest, so rely more on gradual accumulation than one-shot timing.")
    if abs(weekly_delta) > 120:
        risk_flags.append("Weekly path is volatile, which increases forecast uncertainty beyond the first day.")
    if holdings > 0 and action == "BUY":
        risk_flags.append("Existing holdings already create price exposure, so avoid over-concentration.")

    reasoning = (
        f"The deterministic engine sees a {trend} setup with an expected {pct_change:+.2f}% move by tomorrow's close. "
        f"Given a {risk} profile and a monthly budget of Rs {budget:,.0f}, the preferred move is {action.lower()} with a {strategy.lower()} approach."
    )

    return {
        "action": action,
        "confidence": max(1, min(10, round(confidence / 10))),
        "title": title,
        "reasoning": reasoning,
        "key_factors": key_factors,
        "suggested_amount_inr": suggested_amount,
        "best_form": best_form,
        "timeframe": user_profile.get("investment_goal", "both").replace("_", "-").title(),
        "risk_note": risk_flags[0] if risk_flags else "Gold still reacts sharply to macro, FX, and geopolitical shocks.",
        "strategy": strategy,
        "target_allocation_pct": target_allocation,
        "entry_band_24k_per_gram": entry_band,
        "alert_reason": f"{title} based on tomorrow's forecast, the weekly path, and your {risk} risk profile.",
        "risk_flags": risk_flags,
    }
