function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeConfidenceInterval(interval = {}) {
  if (!interval || typeof interval !== 'object') return null

  const lowerUsd = toNumber(interval.lower_usd)
  const upperUsd = toNumber(interval.upper_usd)
  if (lowerUsd == null && upperUsd == null) return null

  return {
    lower_usd: lowerUsd,
    upper_usd: upperUsd,
    lower_24k_per_gram: toNumber(interval.lower_24k_per_gram),
    upper_24k_per_gram: toNumber(interval.upper_24k_per_gram),
    lower_22k_per_gram: toNumber(interval.lower_22k_per_gram),
    upper_22k_per_gram: toNumber(interval.upper_22k_per_gram),
    interval_pct: toNumber(interval.interval_pct),
  }
}

export async function loadSnapshotFirst(snapshotLoader, apiLoader, normalize, isValid) {
  try {
    const snapshotPayload = await snapshotLoader()
    const snapshotData = normalize(snapshotPayload)
    if (isValid(snapshotData)) {
      return snapshotData
    }
  } catch {
    // Snapshot fallback is expected when placeholder files are still present.
  }

  const apiPayload = await apiLoader()
  const apiData = normalize(apiPayload)
  if (!isValid(apiData)) {
    throw new Error('No usable public data returned')
  }
  return apiData
}

export function formatUsd(value, digits = 2) {
  const amount = toNumber(value)
  if (amount == null) return '--'
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

export function formatInr(value, digits = 0) {
  const amount = toNumber(value)
  if (amount == null) return '--'
  return `Rs ${amount.toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

export function formatSignedUsd(value, digits = 2) {
  const amount = toNumber(value)
  if (amount == null) return '--'
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : ''
  return `${sign}${formatUsd(Math.abs(amount), digits)}`
}

export function formatSignedInr(value, digits = 0) {
  const amount = toNumber(value)
  if (amount == null) return '--'
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : ''
  return `${sign}${formatInr(Math.abs(amount), digits)}`
}

export function normalizeToday(payload = {}) {
  const data = payload.today || payload
  return {
    date: data.date || data.verified_date || '',
    reference_mode: data.reference_mode || 'live_last',
    quote_label: data.quote_label || 'Live last available price',
    quote_note: data.quote_note || 'This card shows the latest live or delayed market quote.',
    live_usd: toNumber(data.live_usd || data.usd_per_oz || data.usd),
    price_24k_per_gram: toNumber(data.price_24k_per_gram),
    price_22k_per_gram: toNumber(data.price_22k_per_gram),
    price_24k_per_10g: toNumber(data.price_24k_per_10g),
    price_22k_per_10g: toNumber(data.price_22k_per_10g),
    usd_inr_rate: toNumber(data.usd_inr_rate),
    pricing_formula: data.pricing_formula || null,
    as_of: data.as_of || payload.generated_at || '',
    source: data.source || payload.market_context?.source || 'snapshot',
    market_status: data.market_status || payload.market_context?.market_status || 'delayed',
    is_live: Boolean(data.is_live),
    location: data.location || payload.market_context?.location || 'India benchmark',
    verified_date: data.verified_date || '',
  }
}

export function normalizeTomorrow(payload = {}) {
  const data = payload.tomorrow || payload
  const modelInfo = payload.model_info || data.model_info || {}

  return {
    prediction_date: data.prediction_date || data.target_date || '',
    target_date: data.target_date || data.prediction_date || '',
    target_type: data.target_type || 'calendar_close',
    market_closed: Boolean(data.market_closed),
    last_data_date: data.last_data_date || '',
    last_actual_usd: toNumber(data.last_actual_usd),
    reference_mode: data.reference_mode || 'live_last',
    reference_live_usd: toNumber(data.reference_live_usd),
    reference_as_of: data.reference_as_of || data.as_of || payload.generated_at || '',
    reference_source: data.reference_source || data.source || payload.market_context?.source || 'snapshot',
    reference_market_status: data.reference_market_status || data.market_status || payload.market_context?.market_status || 'delayed',
    reference_is_live: Boolean(data.reference_is_live ?? data.is_live),
    today_quote_note: data.today_quote_note || 'Compared with today\'s live last price.',
    tomorrow_usd: toNumber(data.tomorrow_usd || data.usd),
    tomorrow_price_24k_per_gram: toNumber(data.tomorrow_price_24k_per_gram || data.price_24k_per_gram),
    tomorrow_price_22k_per_gram: toNumber(data.tomorrow_price_22k_per_gram || data.price_22k_per_gram),
    tomorrow_price_24k_per_10g: toNumber(data.tomorrow_price_24k_per_10g || data.price_24k_per_10g),
    tomorrow_price_22k_per_10g: toNumber(data.tomorrow_price_22k_per_10g || data.price_22k_per_10g),
    usd_inr_rate: toNumber(data.usd_inr_rate),
    trend: data.direction_vs_today || data.trend || 'stable',
    direction_vs_today: data.direction_vs_today || data.trend || 'stable',
    direction_delta_pct: toNumber(data.direction_delta_pct ?? data.pct_change),
    direction_delta_usd: toNumber(data.direction_delta_usd),
    pct_change: toNumber(data.direction_delta_pct ?? data.pct_change),
    direction_confidence: toNumber(data.direction_confidence),
    confidence_interval: normalizeConfidenceInterval(data.confidence_interval),
    model_mape: toNumber(data.model_mape || modelInfo.mape),
    model_direction_accuracy: toNumber(data.model_direction_accuracy || modelInfo.direction_accuracy),
    model_cv_direction_accuracy: toNumber(data.model_cv_direction_accuracy || modelInfo.cv_direction_accuracy),
    interval_coverage: toNumber(modelInfo.interval_coverage),
    macro_features_active: Boolean(data.macro_features_active || modelInfo.macro_features),
    pricing_formula: data.tomorrow_pricing_formula || data.pricing_formula || null,
    sentiment: data.sentiment || null,
    as_of: data.as_of || payload.generated_at || '',
    source: data.source || 'model_forecast',
    market_status: data.market_status || 'forecast',
    is_live: Boolean(data.is_live),
  }
}

function normalizeWeekRow(row = {}) {
  return {
    date: row.date || row.target_date || '',
    target_date: row.target_date || row.date || '',
    day: row.day || '',
    status: row.status || 'forecast',
    market_status: row.market_status || row.status || 'forecast',
    is_trading_day: row.is_trading_day !== false,
    usd: toNumber(row.usd),
    usd_inr_rate: toNumber(row.usd_inr_rate),
    price_24k_per_gram: toNumber(row.price_24k_per_gram),
    price_22k_per_gram: toNumber(row.price_22k_per_gram),
    price_24k_per_10g: toNumber(row.price_24k_per_10g),
    price_22k_per_10g: toNumber(row.price_22k_per_10g),
    confidence_interval: normalizeConfidenceInterval(row.confidence_interval),
    reference_live_usd: toNumber(row.reference_live_usd),
    direction_vs_today: row.direction_vs_today || 'stable',
    direction_delta_pct: toNumber(row.direction_delta_pct),
    direction_delta_usd: toNumber(row.direction_delta_usd),
  }
}

export function normalizeWeek(payload = {}) {
  const weekPayload = payload.week || payload
  const forecast = Array.isArray(weekPayload.forecast) ? weekPayload.forecast : []
  return {
    forecast: forecast.map(normalizeWeekRow),
    market_context: weekPayload.market_context || payload.market_context || null,
    generated_at: payload.generated_at || '',
  }
}

function normalizeAccuracyRow(row = {}) {
  const predictedUsd = toNumber(row.predicted_price_usd)
  const actualUsd = toNumber(row.actual_price_usd)
  const difference = toNumber(row.difference)

  return {
    prediction_date: row.prediction_date || row.target_date || '',
    target_date: row.target_date || row.prediction_date || '',
    predicted_on: row.predicted_on || '',
    horizon: row.horizon || '',
    predicted_price_usd: predictedUsd,
    actual_price_usd: actualUsd,
    difference: difference ?? (predictedUsd != null && actualUsd != null ? actualUsd - predictedUsd : null),
    pct_error: toNumber(row.pct_error),
    predicted_price_24k_per_gram: toNumber(row.predicted_price_24k_per_gram),
    actual_price_24k_per_gram: toNumber(row.actual_price_24k_per_gram),
    difference_24k_per_gram: toNumber(row.difference_24k_per_gram),
    pct_error_24k_per_gram: toNumber(row.pct_error_24k_per_gram),
    predicted_price_22k_per_gram: toNumber(row.predicted_price_22k_per_gram),
    actual_price_22k_per_gram: toNumber(row.actual_price_22k_per_gram),
    difference_22k_per_gram: toNumber(row.difference_22k_per_gram),
    pct_error_22k_per_gram: toNumber(row.pct_error_22k_per_gram),
    predicted_price_24k_per_10g: toNumber(row.predicted_price_24k_per_10g),
    actual_price_24k_per_10g: toNumber(row.actual_price_24k_per_10g),
    predicted_price_22k_per_10g: toNumber(row.predicted_price_22k_per_10g),
    actual_price_22k_per_10g: toNumber(row.actual_price_22k_per_10g),
    predicted_trend: row.predicted_trend || 'stable',
    actual_trend: row.actual_trend || 'stable',
    direction_correct: row.direction_correct === 1 || row.direction_correct === true ? 1 : 0,
    status: row.status || 'evaluated',
    created_at: row.created_at || '',
  }
}

export function normalizeAccuracy(payload = {}) {
  const fullHistorySource = payload.full_history || payload.rows || payload.logs || []
  const latestSource = payload.latest_7 || payload.preview || fullHistorySource.slice(0, 7)
  const fullHistory = fullHistorySource.map(normalizeAccuracyRow)
  const latest = latestSource.map(normalizeAccuracyRow)

  return {
    latest_7: latest,
    full_history: fullHistory,
    preview: latest,
    rows: fullHistory,
    count: payload.count || fullHistory.length,
  }
}

export function buildAccuracySummary(rows = []) {
  if (!rows.length) return null

  const total = rows.length
  const avgMape = rows.reduce((sum, row) => sum + (row.pct_error || 0), 0) / total
  const directionAccuracy = rows.reduce((sum, row) => sum + (row.direction_correct || 0), 0) / total
  const avgUsdDiff = rows.reduce((sum, row) => sum + Math.abs(row.difference || 0), 0) / total

  return {
    total,
    avg_mape: avgMape,
    direction_accuracy: directionAccuracy * 100,
    avg_usd_diff: avgUsdDiff,
  }
}
