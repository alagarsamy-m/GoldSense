import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  Minus,
  RefreshCw,
  Shield,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { getPredictionTomorrow } from '../../services/api'
import { getTomorrowSnapshot } from '../../services/snapshots'
import {
  formatInr,
  formatUsd,
  loadSnapshotFirst,
  normalizeTomorrow,
} from '../../utils/marketData'

function TrendBadge({ trend, pctChange }) {
  const config = {
    up: { icon: <TrendingUp size={13} />, color: 'text-green-400 bg-green-400/10', label: 'Rise' },
    down: { icon: <TrendingDown size={13} />, color: 'text-red-400 bg-red-400/10', label: 'Fall' },
    stable: { icon: <Minus size={13} />, color: 'text-slate-300 bg-slate-700/40', label: 'Stable' },
  }

  const tone = config[trend] || config.stable
  const suffix = pctChange != null ? ` ${pctChange > 0 ? '+' : ''}${pctChange.toFixed(2)}%` : ''

  return (
    <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${tone.color}`}>
      {tone.icon}
      {tone.label}{suffix}
    </span>
  )
}

function PriceCard({ label, perGram, perTenGram, emphasis = 'text-white' }) {
  return (
    <div className="rounded-2xl border border-slate-700/40 bg-slate-900/60 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 price-number text-2xl font-bold ${emphasis}`}>{formatInr(perGram)}</p>
      <p className="mt-1 text-xs text-slate-500">per gram</p>
      <p className="mt-3 text-xs text-slate-400">
        10g: <span className="price-number text-slate-200">{formatInr(perTenGram)}</span>
      </p>
    </div>
  )
}

export default function PricePredictor() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const hydrate = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }

    try {
      const snapshotData = await loadSnapshotFirst(
        getTomorrowSnapshot,
        getPredictionTomorrow,
        normalizeTomorrow,
        (result) => result?.tomorrow_usd != null,
      )
      setData(snapshotData)
      setError(null)
      setLoading(false)

      try {
        const liveData = normalizeTomorrow(await getPredictionTomorrow())
        if (liveData?.tomorrow_usd != null) setData(liveData)
      } catch {
        // Snapshot remains the source of truth when the backend is cold.
      }
    } catch {
      setError('Unable to load tomorrow\'s prediction right now.')
      setLoading(false)
    }
  }

  useEffect(() => {
    hydrate()
  }, [])

  if (loading && !data) {
    return (
      <div className="card-premium p-8">
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="text-sm text-slate-400">Preparing tomorrow&apos;s estimated close...</p>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="card-premium border-red-500/20 p-8">
        <div className="flex flex-col items-center gap-4 py-8">
          <AlertCircle size={40} className="text-red-400" />
          <p className="text-center text-sm text-slate-300">{error}</p>
          <button
            onClick={() => hydrate()}
            className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-400 transition-all hover:bg-amber-500/20"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      </div>
    )
  }

  const interval = data?.confidence_interval
  const metadataLine = [
    data?.source,
    `ref ${data?.reference_source || 'snapshot'}`,
    data?.reference_market_status,
  ].filter(Boolean).join(' | ')

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card-premium p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Tomorrow&apos;s Prediction</h2>
          <p className="mt-1 text-sm text-slate-500">
            Estimated close for {data?.prediction_date || '--'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TrendBadge trend={data?.direction_vs_today} pctChange={data?.direction_delta_pct} />
          <button
            onClick={() => hydrate({ silent: Boolean(data) })}
            className="rounded-lg p-2 text-slate-600 transition-all hover:bg-amber-500/10 hover:text-amber-400"
            title="Refresh forecast"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-orange-600/5 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-xs uppercase tracking-widest text-slate-400">Estimated close - Gold USD / Troy Oz</p>
            <p className="price-number text-3xl font-black text-white md:text-4xl">{formatUsd(data?.tomorrow_usd)}</p>
            <p className="mt-2 text-xs text-slate-500">
              Today&apos;s live reference: <span className="price-number text-slate-300">{formatUsd(data?.reference_live_usd)}</span>
            </p>
          </div>

          <div className="rounded-2xl border border-white/6 bg-slate-950/30 px-4 py-3 text-right">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Direction confidence</p>
            <p className="price-number mt-1 text-2xl font-bold text-white">
              {data?.direction_confidence != null ? `${data.direction_confidence}%` : '--'}
            </p>
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-slate-400">
          {data?.today_quote_note || 'Rise, fall, or stable is decided by comparing tomorrow\'s estimated close against today\'s live last price.'}
        </p>
        {data?.market_closed && (
          <p className="mt-2 text-xs text-amber-300">
            Tomorrow is a market-closed day, so this view carries forward the latest available market level for that calendar date.
          </p>
        )}
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-2">
        <PriceCard
          label="24k estimate"
          perGram={data?.tomorrow_price_24k_per_gram}
          perTenGram={data?.tomorrow_price_24k_per_10g}
          emphasis="text-amber-400"
        />
        <PriceCard
          label="22k estimate"
          perGram={data?.tomorrow_price_22k_per_gram}
          perTenGram={data?.tomorrow_price_22k_per_10g}
        />
      </div>

      {interval && (
        <div className="mb-5 rounded-2xl border border-slate-700/40 bg-slate-900/40 p-4">
          <p className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">Confidence range</p>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <p className="text-xs text-slate-500">USD / oz</p>
              <p className="price-number mt-1 text-sm text-white">
                {formatUsd(interval.lower_usd)} to {formatUsd(interval.upper_usd)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">24k / g</p>
              <p className="price-number mt-1 text-sm text-white">
                {formatInr(interval.lower_24k_per_gram)} to {formatInr(interval.upper_24k_per_gram)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Range width</p>
              <p className="price-number mt-1 text-sm text-white">
                {interval.interval_pct != null ? `${interval.interval_pct}%` : '--'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700/30 pt-4">
        <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
          <span>USD/INR: <span className="price-number text-slate-300">{data?.usd_inr_rate ?? '--'}</span></span>
          <span>MAPE: <span className="price-number text-slate-300">{data?.model_mape != null ? `${data.model_mape.toFixed(2)}%` : '--'}</span></span>
          <span>Direction: <span className="price-number text-slate-300">{data?.model_direction_accuracy != null ? `${data.model_direction_accuracy.toFixed(1)}%` : '--'}</span></span>
          {data?.sentiment?.label && (
            <span>Sentiment: <span className="text-slate-300">{data.sentiment.label}</span></span>
          )}
        </div>
        <p className="flex items-center gap-1 text-[10px] text-slate-600">
          <Shield size={9} /> {metadataLine || 'Forecast metadata unavailable'}
        </p>
      </div>
    </motion.div>
  )
}
