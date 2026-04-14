import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, Pause, RefreshCw, TrendingDown, TrendingUp, Zap } from 'lucide-react'
import { getRecommendations } from '../../services/api'
import { formatInr } from '../../utils/marketData'

const ACTION_CONFIG = {
  BUY: { color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30', icon: <TrendingUp size={18} />, label: 'Buy gradually' },
  SELL: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: <TrendingDown size={18} />, label: 'Trim exposure' },
  HOLD: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: <Pause size={18} />, label: 'Hold and stay disciplined' },
  WAIT: { color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/30', icon: <RefreshCw size={18} />, label: 'Wait for a better entry' },
}

function InfoBlock({ title, value, emphasize = false }) {
  if (!value) return null

  return (
    <div className="rounded-xl bg-slate-800/50 p-4">
      <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">{title}</p>
      <p className={`text-sm font-medium leading-relaxed ${emphasize ? 'text-amber-300' : 'text-white'}`}>{value}</p>
    </div>
  )
}

export default function Recommendations() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchRecommendation = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getRecommendations()
      setData(result)
    } catch (err) {
      const message = err.response?.data?.detail || 'Could not generate recommendation'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecommendation()
  }, [])

  if (loading) {
    return (
      <div className="glass-card flex h-56 items-center justify-center rounded-2xl p-8 gold-border">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="text-sm text-slate-400">Preparing your personalized guidance...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass-card rounded-2xl border border-red-500/20 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="mt-0.5 flex-shrink-0 text-red-400" />
          <div>
            <p className="mb-1 font-medium text-white">Recommendation unavailable</p>
            <p className="text-sm text-slate-400">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  const rec = data?.recommendation
  if (!rec) return null

  const config = ACTION_CONFIG[rec.action] || ACTION_CONFIG.HOLD
  const band = rec.entry_band_24k_per_gram || {}
  const entryZone = band.lower_24k_per_gram && band.upper_24k_per_gram
    ? `${formatInr(band.lower_24k_per_gram)} to ${formatInr(band.upper_24k_per_gram)}`
    : null
  const riskFlags = rec.risk_flags?.length ? rec.risk_flags.join(' ') : rec.risk_note

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl p-6 gold-border">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
            <Zap size={18} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Personalized Intelligence</h3>
            <p className="text-xs text-slate-500">Simple decision support from your profile and the current forecast.</p>
          </div>
        </div>
        <button
          onClick={fetchRecommendation}
          className="rounded-lg p-2 text-slate-500 transition-all hover:bg-amber-500/10 hover:text-amber-400"
          title="Refresh recommendation"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <div className={`mb-6 rounded-2xl border px-5 py-4 ${config.bg} ${config.border}`}>
        <div className="flex flex-wrap items-center gap-3">
          <span className={config.color}>{config.icon}</span>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">What to do now</p>
            <p className={`text-2xl font-black ${config.color}`}>{config.label}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <InfoBlock title="Why" value={rec.reasoning} />
        <InfoBlock title="Suggested entry zone" value={entryZone || rec.alert_reason} emphasize />
        <InfoBlock title="Suggested amount / instrument" value={`${rec.suggested_amount_inr ? formatInr(rec.suggested_amount_inr) : 'No fresh allocation'} | ${rec.best_form || 'Gold allocation'}`} />
        <InfoBlock title="Risk flags" value={riskFlags || 'Gold still reacts sharply to macro, FX, and geopolitical shocks.'} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <InfoBlock title="Strategy" value={rec.strategy} emphasize />
        <InfoBlock title="Target allocation" value={rec.target_allocation_pct} />
        <InfoBlock title="Timeframe" value={rec.timeframe} />
      </div>

      {rec.key_factors?.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Why the engine thinks this way</p>
          <div className="flex flex-wrap gap-2">
            {rec.key_factors.map((factor) => (
              <span key={factor} className="rounded-lg border border-slate-700/50 bg-slate-800/80 px-2.5 py-1 text-xs text-slate-300">
                {factor}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="mt-4 text-center text-xs text-slate-600">Decision support only. Not financial advice.</p>
    </motion.div>
  )
}
