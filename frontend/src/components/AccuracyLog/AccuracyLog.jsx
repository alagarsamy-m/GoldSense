import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart2, Expand, RefreshCw, Shield } from 'lucide-react'
import { getAccuracyLogs, getSystemStatus } from '../../services/api'
import { getAccuracySnapshot } from '../../services/snapshots'
import {
  buildAccuracySummary,
  formatInr,
  formatSignedInr,
  formatSignedUsd,
  formatUsd,
  loadSnapshotFirst,
  normalizeAccuracy,
} from '../../utils/marketData'

function SummaryCards({ summary, status }) {
  if (!summary) return null

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <div className="rounded-2xl bg-slate-800/50 p-4 text-center">
        <p className="text-xs text-slate-500">Avg MAPE</p>
        <p className="price-number mt-1 text-lg font-bold text-amber-400">{summary.avg_mape.toFixed(2)}%</p>
      </div>
      <div className="rounded-2xl bg-slate-800/50 p-4 text-center">
        <p className="text-xs text-slate-500">Direction Match</p>
        <p className="price-number mt-1 text-lg font-bold text-white">{summary.direction_accuracy.toFixed(1)}%</p>
      </div>
      <div className="rounded-2xl bg-slate-800/50 p-4 text-center">
        <p className="text-xs text-slate-500">Avg USD Difference</p>
        <p className="price-number mt-1 text-lg font-bold text-white">{formatUsd(summary.avg_usd_diff)}</p>
      </div>
      <div className="rounded-2xl bg-slate-800/50 p-4 text-center">
        <p className="text-xs text-slate-500">Updated</p>
        <p className="mt-1 text-sm font-semibold text-white">
          {status?.updated_at ? new Date(status.updated_at).toLocaleDateString() : 'Daily'}
        </p>
      </div>
    </div>
  )
}

function AccuracyTable({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/40 text-left text-xs text-slate-500">
            <th className="pb-3 pr-4 font-medium">Date</th>
            <th className="pb-3 pr-4 font-medium">Pred USD/oz</th>
            <th className="pb-3 pr-4 font-medium">Pred 24k</th>
            <th className="pb-3 pr-4 font-medium">Pred 22k</th>
            <th className="pb-3 pr-4 font-medium">Actual USD/oz</th>
            <th className="pb-3 pr-4 font-medium">Actual 24k</th>
            <th className="pb-3 pr-4 font-medium">Actual 22k</th>
            <th className="pb-3 pr-4 font-medium">USD Diff</th>
            <th className="pb-3 pr-4 font-medium">24k Diff</th>
            <th className="pb-3 pr-4 font-medium">22k Diff</th>
            <th className="pb-3 font-medium">Move</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.target_date}-${row.predicted_on || 'none'}`} className="border-b border-slate-800/40">
              <td className="py-3 pr-4">
                <p className="text-white">{row.target_date}</p>
                {row.predicted_on && <p className="text-[11px] text-slate-500">logged daily</p>}
              </td>
              <td className="price-number py-3 pr-4 text-white">{formatUsd(row.predicted_price_usd)}</td>
              <td className="price-number py-3 pr-4 text-amber-300">{formatInr(row.predicted_price_24k_per_gram)}</td>
              <td className="price-number py-3 pr-4 text-slate-200">{formatInr(row.predicted_price_22k_per_gram)}</td>
              <td className="price-number py-3 pr-4 text-white">{formatUsd(row.actual_price_usd)}</td>
              <td className="price-number py-3 pr-4 text-amber-300">{formatInr(row.actual_price_24k_per_gram)}</td>
              <td className="price-number py-3 pr-4 text-slate-200">{formatInr(row.actual_price_22k_per_gram)}</td>
              <td className="price-number py-3 pr-4 text-white">{formatSignedUsd(row.difference)}</td>
              <td className="price-number py-3 pr-4 text-amber-300">{formatSignedInr(row.difference_24k_per_gram)}</td>
              <td className="price-number py-3 pr-4 text-slate-200">{formatSignedInr(row.difference_22k_per_gram)}</td>
              <td className="py-3 text-slate-300">
                {row.actual_trend === 'up' ? 'Rise' : row.actual_trend === 'down' ? 'Fall' : 'Stable'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function AccuracyLog() {
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  const loadRows = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)

    try {
      const snapshot = await loadSnapshotFirst(
        getAccuracySnapshot,
        () => getAccuracyLogs(5000),
        normalizeAccuracy,
        (result) => Array.isArray(result?.full_history) && result.full_history.length > 0,
      )
      setRows(snapshot.full_history)
      getSystemStatus().then(setStatus).catch(() => setStatus(null))

      try {
        const apiRows = normalizeAccuracy(await getAccuracyLogs(5000))
        if (apiRows.full_history.length) setRows(apiRows.full_history)
      } catch {
        // Keep snapshot data.
      }
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRows({ silent: false })
  }, [])

  const previewRows = useMemo(() => rows.slice(0, 7), [rows])
  const summary = useMemo(() => buildAccuracySummary(rows), [rows])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl p-6 md:p-8 gold-border"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/15">
            <BarChart2 size={18} className="text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Prediction Accuracy</h2>
            <p className="text-xs text-slate-500">The last 7 realized days are shown below. Open the full history for the full record.</p>
          </div>
        </div>

        <button
          onClick={() => loadRows({ silent: Boolean(rows.length) })}
          className="rounded-lg p-2 text-slate-600 transition-all hover:bg-amber-500/10 hover:text-amber-400"
          title="Refresh accuracy logs"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {loading && !rows.length ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-slate-500">
          <BarChart2 size={40} className="mx-auto mb-3 opacity-30" />
          <p>No realized rows yet.</p>
        </div>
      ) : (
        <>
          <SummaryCards summary={summary} status={status} />

          <div className="mt-6">
            <AccuracyTable rows={previewRows} />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-1 text-xs text-slate-600">
              <Shield size={12} /> The log refreshes daily after evaluation runs and actual market data becomes available for that date.
            </p>
            <button
              onClick={() => setExpanded(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-300 transition-colors hover:bg-amber-500/15"
            >
              <Expand size={14} />
              Open Full Table
            </button>
          </div>
        </>
      )}

      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-7xl flex-col rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-white">Full Accuracy History</h3>
                <p className="text-xs text-slate-500">All realized prediction logs, newest first.</p>
              </div>
              <button
                onClick={() => setExpanded(false)}
                className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="overflow-auto p-6">
              <AccuracyTable rows={rows} />
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}
