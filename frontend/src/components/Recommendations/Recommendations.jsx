import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Pause, RefreshCw, AlertCircle, Zap } from 'lucide-react'
import { getRecommendations } from '../../services/api'

const ACTION_CONFIG = {
  BUY: { color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30', icon: <TrendingUp size={18} />, emoji: '📈' },
  SELL: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: <TrendingDown size={18} />, emoji: '📉' },
  HOLD: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: <Pause size={18} />, emoji: '⏸️' },
  WAIT: { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: <RefreshCw size={18} />, emoji: '⏳' },
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
      const msg = err.response?.data?.detail || 'Could not generate recommendation'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecommendation()
  }, [])

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-8 gold-border flex items-center justify-center h-48">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Generating AI recommendation...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass-card rounded-2xl p-6 border border-red-500/20">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-white font-medium mb-1">Recommendation unavailable</p>
            <p className="text-sm text-slate-400">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  const rec = data?.recommendation
  if (!rec) return null

  const config = ACTION_CONFIG[rec.action] || ACTION_CONFIG.HOLD
  const confidenceWidth = `${(rec.confidence / 10) * 100}%`

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl p-6 gold-border"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-500/15 rounded-lg flex items-center justify-center">
            <Zap size={18} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">AI Recommendation</h3>
            <p className="text-xs text-slate-500">Based on your profile + market data</p>
          </div>
        </div>
        <button
          onClick={fetchRecommendation}
          className="p-2 text-slate-500 hover:text-amber-400 rounded-lg hover:bg-amber-500/10 transition-all"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Action badge */}
      <div className={`inline-flex items-center gap-2.5 px-5 py-3 rounded-xl ${config.bg} border ${config.border} mb-5`}>
        <span className={config.color}>{config.icon}</span>
        <span className={`text-2xl font-black ${config.color}`}>{rec.action}</span>
        <span className="text-lg">{config.emoji}</span>
      </div>

      {/* Title and reasoning */}
      <h4 className="text-white font-semibold mb-2">{rec.title}</h4>
      <p className="text-sm text-slate-400 leading-relaxed mb-5">{rec.reasoning}</p>

      {/* Confidence bar */}
      <div className="mb-5">
        <div className="flex justify-between text-xs text-slate-500 mb-1.5">
          <span>Confidence</span>
          <span className="text-amber-400 font-medium">{rec.confidence}/10</span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: confidenceWidth }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full"
          />
        </div>
      </div>

      {/* Key factors */}
      {rec.key_factors?.length > 0 && (
        <div className="mb-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Key Factors</p>
          <div className="flex flex-wrap gap-2">
            {rec.key_factors.map(f => (
              <span key={f} className="text-xs bg-slate-800/80 border border-slate-700/50 text-slate-300 px-2.5 py-1 rounded-lg">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Details row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        {rec.best_form && (
          <div className="bg-slate-800/50 rounded-xl p-3">
            <p className="text-xs text-slate-500 mb-1">Best Form</p>
            <p className="text-xs font-medium text-white">{rec.best_form}</p>
          </div>
        )}
        {rec.timeframe && (
          <div className="bg-slate-800/50 rounded-xl p-3">
            <p className="text-xs text-slate-500 mb-1">Timeframe</p>
            <p className="text-xs font-medium text-white">{rec.timeframe}</p>
          </div>
        )}
        {rec.suggested_amount_inr && (
          <div className="bg-slate-800/50 rounded-xl p-3">
            <p className="text-xs text-slate-500 mb-1">Suggested/month</p>
            <p className="text-xs font-medium text-amber-400 price-number">₹{Number(rec.suggested_amount_inr).toLocaleString('en-IN')}</p>
          </div>
        )}
      </div>

      {rec.risk_note && (
        <div className="flex items-start gap-2 bg-slate-800/30 rounded-xl p-3">
          <AlertCircle size={14} className="text-slate-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500 leading-relaxed">{rec.risk_note}</p>
        </div>
      )}

      <p className="text-xs text-slate-600 mt-3 text-center">Generated by Groq Llama 3.3 • Not financial advice</p>
    </motion.div>
  )
}
