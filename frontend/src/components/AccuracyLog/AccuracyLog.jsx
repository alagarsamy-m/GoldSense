import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { BarChart2, CheckCircle, AlertTriangle } from 'lucide-react'
import { getAccuracyLogs } from '../../services/api'

export default function AccuracyLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAccuracyLogs(20)
      .then(data => setLogs(data.logs || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [])

  // Compute summary stats
  const stats = logs.length > 0 ? {
    avgMape: (logs.reduce((a, l) => a + (l.pct_error || 0), 0) / logs.length).toFixed(2),
    avgMae: (logs.reduce((a, l) => a + Math.abs(l.difference || 0), 0) / logs.length).toFixed(2),
    totalPredictions: logs.length,
    withinPercent: ((logs.filter(l => Math.abs(l.pct_error || 0) < 2).length / logs.length) * 100).toFixed(0),
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
          <h2 className="text-lg font-bold text-white">Prediction Accuracy Log</h2>
          <p className="text-xs text-slate-500">Model prediction vs actual market price</p>
        </div>
      </div>

      {/* Summary stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Avg MAPE', value: `${stats.avgMape}%`, icon: <BarChart2 size={14} /> },
            { label: 'Avg MAE', value: `$${stats.avgMae}`, icon: <BarChart2 size={14} /> },
            { label: 'Within 2%', value: `${stats.withinPercent}%`, icon: <CheckCircle size={14} /> },
            { label: 'Total Logged', value: stats.totalPredictions, icon: <AlertTriangle size={14} /> },
          ].map(s => (
            <div key={s.label} className="bg-slate-800/50 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">{s.label}</p>
              <p className="price-number text-lg font-bold text-amber-400">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-10 text-slate-500">
          <BarChart2 size={40} className="mx-auto mb-3 opacity-30" />
          <p>No accuracy data yet. Check back after the model has been running for a week.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                {['Date', 'Predicted (USD)', 'Actual (USD)', 'Difference', '% Error'].map(h => (
                  <th key={h} className="text-left text-xs text-slate-500 font-medium pb-3 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => {
                const absDiff = Math.abs(log.difference || 0)
                const isGood = Math.abs(log.pct_error || 0) < 2
                return (
                  <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors">
                    <td className="py-2.5 pr-4 text-slate-300 price-number text-xs">{log.prediction_date}</td>
                    <td className="py-2.5 pr-4 price-number text-white">${Number(log.predicted_price_usd).toLocaleString()}</td>
                    <td className="py-2.5 pr-4 price-number text-white">${Number(log.actual_price_usd).toLocaleString()}</td>
                    <td className={`py-2.5 pr-4 price-number ${(log.difference || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {(log.difference || 0) >= 0 ? '+' : ''}${Number(log.difference).toLocaleString()}
                    </td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        isGood
                          ? 'bg-green-400/10 text-green-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {Math.abs(log.pct_error || 0).toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-600 mt-4">
        Accuracy data is updated every Monday via automated CI/CD pipeline.
        Lower MAPE = more accurate model.
      </p>
    </motion.div>
  )
}
