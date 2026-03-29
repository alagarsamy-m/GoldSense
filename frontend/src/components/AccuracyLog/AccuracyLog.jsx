import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart2, CheckCircle, XCircle, AlertTriangle, Activity,
  TrendingUp, TrendingDown, Minus, RefreshCw, Shield
} from 'lucide-react'
import { getAccuracyLogs, getSystemStatus } from '../../services/api'

function YesterdayCard({ logs }) {
  if (!logs || logs.length === 0) return null

  const latest = logs[0]
  const err = Math.abs(latest.pct_error || 0)
  const isGood = err < 2
  const dirOk = latest.direction_correct === 1

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`rounded-xl p-5 border ${
        isGood && dirOk
          ? 'bg-green-500/5 border-green-500/20'
          : isGood || dirOk
            ? 'bg-amber-500/5 border-amber-500/20'
            : 'bg-red-500/5 border-red-500/20'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isGood && dirOk ? (
            <CheckCircle size={18} className="text-green-400" />
          ) : (
            <AlertTriangle size={18} className="text-amber-400" />
          )}
          <h3 className="text-sm font-semibold text-white">Yesterday's Result</h3>
        </div>
        <span className="text-xs text-slate-500">{latest.prediction_date}</span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-slate-500 mb-0.5">We Predicted</p>
          <p className="text-lg font-bold text-white price-number">
            ${Number(latest.predicted_price_usd).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Actual Price</p>
          <p className="text-lg font-bold text-amber-400 price-number">
            ${Number(latest.actual_price_usd).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Accuracy</p>
          <p className={`text-lg font-bold price-number ${isGood ? 'text-green-400' : 'text-red-400'}`}>
            {(100 - err).toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-700/30">
        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
          dirOk ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
        }`}>
          {dirOk ? <CheckCircle size={10} /> : <XCircle size={10} />}
          Direction {dirOk ? 'Correct' : 'Missed'}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          isGood ? 'bg-green-400/10 text-green-400' : 'bg-amber-500/10 text-amber-400'
        }`}>
          {err.toFixed(2)}% error
        </span>
        <span className="text-xs text-slate-500">
          Off by ${Math.abs(latest.difference || 0).toFixed(2)}
        </span>
      </div>
    </motion.div>
  )
}

function SystemHealthCard({ status }) {
  if (!status || status.pipeline === 'no_data') {
    return (
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Activity size={16} className="text-slate-500" />
          <span className="text-sm font-medium text-slate-400">System Status</span>
        </div>
        <p className="text-xs text-slate-600">No evaluation data yet. The daily pipeline will populate this.</p>
      </div>
    )
  }

  const drift = status.drift || {}
  const rolling7 = status.rolling_metrics?.last_7 || {}
  const streak = status.streak || {}
  const insights = status.insights || []

  const isHealthy = !drift.drift_detected
  const streakIcon = streak.type === 'correct'
    ? <TrendingUp size={12} className="text-green-400" />
    : streak.type === 'incorrect'
      ? <TrendingDown size={12} className="text-red-400" />
      : <Minus size={12} className="text-slate-500" />

  return (
    <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield size={16} className={isHealthy ? 'text-green-400' : 'text-red-400'} />
          <span className="text-sm font-medium text-white">MLOps Health</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          isHealthy ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
        }`}>
          {isHealthy ? 'Healthy' : 'Drift Detected'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center">
          <p className="text-xs text-slate-500">7-day MAPE</p>
          <p className="text-sm font-bold text-white price-number">{rolling7.avg_mape ?? '—'}%</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500">Direction</p>
          <p className="text-sm font-bold text-white price-number">{rolling7.direction_accuracy ?? '—'}%</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500">Streak</p>
          <p className="text-sm font-bold text-white flex items-center justify-center gap-1">
            {streakIcon} {streak.count ?? 0}
          </p>
        </div>
      </div>

      {insights.length > 0 && (
        <div className="border-t border-slate-700/30 pt-2">
          {insights.slice(0, 2).map((ins, i) => (
            <p key={i} className="text-xs text-amber-400/80 mt-1">
              {ins.message}
            </p>
          ))}
        </div>
      )}

      {status.updated_at && (
        <p className="text-[10px] text-slate-600 mt-2">
          Last evaluated: {new Date(status.updated_at).toLocaleString()}
        </p>
      )}
    </div>
  )
}

export default function AccuracyLog() {
  const [logs, setLogs] = useState([])
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getAccuracyLogs(20).catch(() => ({ logs: [] })),
      getSystemStatus().catch(() => null),
    ]).then(([logData, statusData]) => {
      setLogs(logData.logs || [])
      setStatus(statusData)
    }).finally(() => setLoading(false))
  }, [])

  const stats = logs.length > 0 ? {
    avgMape: (logs.reduce((a, l) => a + (l.pct_error || 0), 0) / logs.length).toFixed(2),
    avgMae: (logs.reduce((a, l) => a + Math.abs(l.difference || 0), 0) / logs.length).toFixed(2),
    totalPredictions: logs.length,
    withinPercent: ((logs.filter(l => Math.abs(l.pct_error || 0) < 2).length / logs.length) * 100).toFixed(0),
    directionAcc: ((logs.filter(l => l.direction_correct === 1).length / logs.length) * 100).toFixed(1),
  } : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="glass-card rounded-2xl p-6 md:p-8 gold-border"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-amber-500/15 rounded-lg flex items-center justify-center">
          <BarChart2 size={18} className="text-amber-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Prediction Accuracy</h2>
          <p className="text-xs text-slate-500">Daily evaluation — predicted vs actual gold price</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-10 text-slate-500">
          <BarChart2 size={40} className="mx-auto mb-3 opacity-30" />
          <p>No accuracy data yet. The daily pipeline will start logging predictions.</p>
        </div>
      ) : (
        <>
          {/* Yesterday's Result — Hero Card */}
          <YesterdayCard logs={logs} />

          {/* System Health + Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <SystemHealthCard status={status} />

            {/* Summary Stats */}
            {stats && (
              <div className="grid grid-cols-2 gap-3 content-start">
                {[
                  { label: 'Avg MAPE', value: `${stats.avgMape}%` },
                  { label: 'Direction Acc', value: `${stats.directionAcc}%` },
                  { label: 'Within 2%', value: `${stats.withinPercent}%` },
                  { label: 'Total Logged', value: stats.totalPredictions },
                ].map(s => (
                  <div key={s.label} className="bg-slate-800/50 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-500 mb-0.5">{s.label}</p>
                    <p className="price-number text-base font-bold text-amber-400">{s.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Accuracy Table */}
          <div className="overflow-x-auto mt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  {['Date', 'Predicted', 'Actual', 'Error', 'Dir'].map(h => (
                    <th key={h} className="text-left text-xs text-slate-500 font-medium pb-3 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const isGood = Math.abs(log.pct_error || 0) < 2
                  const dirOk = log.direction_correct === 1
                  return (
                    <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors">
                      <td className="py-2 pr-4 text-slate-400 text-xs">{log.prediction_date}</td>
                      <td className="py-2 pr-4 price-number text-white text-xs">
                        ${Number(log.predicted_price_usd).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-2 pr-4 price-number text-white text-xs">
                        ${Number(log.actual_price_usd).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`text-xs font-medium ${isGood ? 'text-green-400' : 'text-amber-400'}`}>
                          {Math.abs(log.pct_error || 0).toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-2">
                        {dirOk
                          ? <CheckCircle size={14} className="text-green-400" />
                          : <XCircle size={14} className="text-red-400/60" />
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-xs text-slate-600 mt-4">
        Evaluated daily via automated MLOps pipeline. Model auto-retrains when drift is detected.
      </p>
    </motion.div>
  )
}
