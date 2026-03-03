import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, RefreshCw, AlertCircle } from 'lucide-react'
import { getPredictionTomorrow } from '../../services/api'

const StatCard = ({ label, value, subLabel, highlight = false }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={`rounded-xl p-5 ${
      highlight
        ? 'bg-gradient-to-br from-amber-500/15 to-orange-500/10 border border-amber-500/30 gold-glow'
        : 'bg-slate-800/60 border border-slate-700/50'
    }`}
  >
    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">{label}</p>
    <p className={`price-number text-2xl font-bold ${highlight ? 'text-amber-400' : 'text-white'}`}>
      {value}
    </p>
    {subLabel && <p className="text-xs text-slate-500 mt-1">{subLabel}</p>}
  </motion.div>
)

function TrendBadge({ trend, pctChange }) {
  if (trend === 'up') return (
    <span className="flex items-center gap-1 text-green-400 bg-green-400/10 px-3 py-1 rounded-full text-sm font-medium">
      <TrendingUp size={14} />
      +{Math.abs(pctChange).toFixed(2)}%
    </span>
  )
  if (trend === 'down') return (
    <span className="flex items-center gap-1 text-red-400 bg-red-400/10 px-3 py-1 rounded-full text-sm font-medium">
      <TrendingDown size={14} />
      -{Math.abs(pctChange).toFixed(2)}%
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-slate-400 bg-slate-700/50 px-3 py-1 rounded-full text-sm font-medium">
      <Minus size={14} />
      Stable
    </span>
  )
}

export default function PricePredictor() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)

  const fetchPrediction = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getPredictionTomorrow()
      setData(result)
      setLastRefresh(new Date())
    } catch (err) {
      setError('Unable to fetch prediction. The model may be loading.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPrediction()
  }, [])

  const formatINR = (value) => {
    if (!value) return '—'
    return `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  }

  const formatUSD = (value) => {
    if (!value) return '—'
    return `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  }

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-8 gold-border">
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400">Fetching AI prediction...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass-card rounded-2xl p-8 border border-red-500/20">
        <div className="flex flex-col items-center gap-4 py-8">
          <AlertCircle size={40} className="text-red-400" />
          <p className="text-slate-300 text-center">{error}</p>
          <button
            onClick={fetchPrediction}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg hover:bg-amber-500/20 transition-all"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-card rounded-2xl p-6 md:p-8 gold-border">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Tomorrow's Gold Price</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            AI Prediction for {data?.prediction_date}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data && <TrendBadge trend={data.trend} pctChange={data.pct_change} />}
          <button
            onClick={fetchPrediction}
            className="p-2 text-slate-500 hover:text-amber-400 rounded-lg hover:bg-amber-500/10 transition-all"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Price grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Gold USD / oz"
          value={formatUSD(data?.tomorrow_usd)}
          subLabel={`Last actual: ${formatUSD(data?.last_actual_usd)}`}
          highlight
        />
        <StatCard
          label="24k / gram (Chennai)"
          value={formatINR(data?.tomorrow_price_24k_per_gram)}
          subLabel={`10g = ${formatINR(data?.tomorrow_price_24k_per_10g)}`}
        />
        <StatCard
          label="22k / gram (Chennai)"
          value={formatINR(data?.tomorrow_price_22k_per_gram)}
          subLabel={`10g = ${formatINR(data?.tomorrow_price_22k_per_10g)}`}
        />
      </div>

      {/* Footer info */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-700/50">
        <div className="flex flex-wrap gap-4 text-xs text-slate-500">
          <span>USD/INR: <span className="text-slate-300 price-number">₹{data?.usd_inr_rate}</span></span>
          <span>Model MAPE: <span className="text-slate-300 price-number">{data?.model_mape?.toFixed(2)}%</span></span>
          <span>RMSE: <span className="text-slate-300 price-number">${data?.model_rmse?.toFixed(0)}</span></span>
        </div>
        <p className="text-xs text-slate-600">
          Powered by XGBoost AI • Not financial advice
        </p>
      </div>
    </div>
  )
}
