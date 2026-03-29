import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, RefreshCw, AlertCircle, Shield, Gem } from 'lucide-react'
import { getPredictionTomorrow } from '../../services/api'

function TrendBadge({ trend, pctChange }) {
  const config = {
    up:   { icon: <TrendingUp size={13} />, color: 'text-green-400 bg-green-400/10', sign: '+' },
    down: { icon: <TrendingDown size={13} />, color: 'text-red-400 bg-red-400/10', sign: '-' },
    stable: { icon: <Minus size={13} />, color: 'text-slate-400 bg-slate-700/40', sign: '' },
  }
  const c = config[trend] || config.stable
  return (
    <span className={`flex items-center gap-1.5 ${c.color} px-3 py-1 rounded-full text-xs font-semibold`}>
      {c.icon}
      {trend === 'stable' ? 'Stable' : `${c.sign}${Math.abs(pctChange).toFixed(2)}%`}
    </span>
  )
}

function KaratCard({ karat, perGram, perTenG, isActive }) {
  const is24 = karat === '24k'
  return (
    <motion.div
      layout
      className={`rounded-xl p-4 transition-all duration-300 ${
        is24
          ? 'karat-24k'
          : 'karat-22k'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Gem size={14} className={is24 ? 'text-amber-400' : 'text-purple-400'} />
        <span className={`text-xs font-bold uppercase tracking-wider ${is24 ? 'text-amber-300' : 'text-purple-300'}`}>
          {karat} Gold
        </span>
      </div>
      <p className={`text-2xl font-bold price-number ${is24 ? 'text-amber-400' : 'text-purple-300'}`}>
        {perGram ? `₹${Number(perGram).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
      </p>
      <p className="text-[11px] text-slate-500 mt-1">per gram</p>
      <div className="mt-2 pt-2 border-t border-white/5">
        <p className="text-xs text-slate-400">
          10g = <span className="text-white font-medium price-number">
            ₹{perTenG ? Number(perTenG).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'}
          </span>
        </p>
      </div>
    </motion.div>
  )
}

function getNextBusinessDay() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function PricePredictor() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchPrediction = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getPredictionTomorrow()
      setData(result)
    } catch {
      setError('Unable to fetch prediction. The model may be loading.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPrediction() }, [])

  const formatUSD = (v) => v ? `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—'

  if (loading) {
    return (
      <div className="card-premium p-8">
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading AI prediction...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card-premium p-8 border-red-500/20">
        <div className="flex flex-col items-center gap-4 py-8">
          <AlertCircle size={40} className="text-red-400" />
          <p className="text-slate-300 text-center text-sm">{error}</p>
          <button onClick={fetchPrediction}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg hover:bg-amber-500/20 transition-all">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-premium p-6 md:p-8"
    >
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Tomorrow's Gold Price</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            AI Prediction for {getNextBusinessDay()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data && <TrendBadge trend={data.trend} pctChange={data.pct_change} />}
          <button onClick={fetchPrediction}
            className="p-2 text-slate-600 hover:text-amber-400 rounded-lg hover:bg-amber-500/10 transition-all"
            title="Refresh">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* ── USD Price Hero ────────────────────────────────── */}
      <div className="rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-600/5 border border-amber-500/20 p-5 mb-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Gold USD / Troy Oz</p>
            <p className="text-3xl md:text-4xl font-bold gold-text-static price-number">
              {formatUSD(data?.tomorrow_usd)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Last actual: {formatUSD(data?.last_actual_usd)}
            </p>
          </div>
          {data?.direction_confidence && (
            <div className="text-right">
              <p className="text-xs text-slate-500 mb-1">Confidence</p>
              <p className="text-2xl font-bold text-white price-number">{data.direction_confidence}%</p>
            </div>
          )}
        </div>
      </div>

      {/* ── 24k and 22k Cards ─────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <KaratCard
          karat="24k"
          perGram={data?.tomorrow_price_24k_per_gram}
          perTenG={data?.tomorrow_price_24k_per_10g}
          isActive
        />
        <KaratCard
          karat="22k"
          perGram={data?.tomorrow_price_22k_per_gram}
          perTenG={data?.tomorrow_price_22k_per_10g}
          isActive
        />
      </div>

      {/* ── Confidence Interval ───────────────────────────── */}
      {data?.confidence_interval && (
        <div className="rounded-xl bg-slate-800/30 border border-slate-700/30 p-4 mb-5">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">80% Confidence Range</p>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex justify-between text-[10px] text-slate-600 mb-1">
                <span>Low</span>
                <span>Predicted</span>
                <span>High</span>
              </div>
              <div className="relative h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
                <div className="absolute h-full bg-gradient-to-r from-amber-600/50 via-amber-400 to-amber-600/50 rounded-full"
                  style={{ left: '10%', right: '10%' }} />
              </div>
              <div className="flex justify-between text-xs mt-1.5">
                <span className="text-slate-500 price-number">{formatUSD(data.confidence_interval.lower_usd)}</span>
                <span className="text-amber-400 font-semibold price-number">{formatUSD(data.tomorrow_usd)}</span>
                <span className="text-slate-500 price-number">{formatUSD(data.confidence_interval.upper_usd)}</span>
              </div>
            </div>
            <div className="text-right pl-3 border-l border-slate-700/40">
              <p className="text-[10px] text-slate-600">Spread</p>
              <p className="text-sm text-slate-300 font-medium price-number">{data.confidence_interval.interval_pct}%</p>
            </div>
          </div>
          {data.confidence_interval.lower_24k_per_gram && (
            <div className="mt-2 pt-2 border-t border-slate-700/20 flex justify-between text-[11px] text-slate-600">
              <span>24k/g: <span className="text-slate-400 price-number">
                ₹{Number(data.confidence_interval.lower_24k_per_gram).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span></span>
              <span>to <span className="text-slate-400 price-number">
                ₹{Number(data.confidence_interval.upper_24k_per_gram).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span></span>
            </div>
          )}
        </div>
      )}

      {/* ── Footer Metrics ────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-700/30">
        <div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
          <span>USD/INR: <span className="text-slate-400 price-number">₹{data?.usd_inr_rate}</span></span>
          <span>MAPE: <span className="text-slate-400 price-number">{data?.model_mape?.toFixed(2)}%</span></span>
          {data?.model_direction_accuracy > 0 && (
            <span>Direction: <span className="text-slate-400 price-number">{data.model_direction_accuracy.toFixed(1)}%</span></span>
          )}
          {data?.sentiment && data.sentiment.label !== 'Neutral' && (
            <span>Sentiment: <span className={data.sentiment.label === 'Bullish' ? 'text-green-400' : 'text-red-400'}>
              {data.sentiment.label}
            </span></span>
          )}
        </div>
        <p className="text-[10px] text-slate-700 flex items-center gap-1">
          <Shield size={9} /> AI Prediction — Not financial advice
        </p>
      </div>
    </motion.div>
  )
}
