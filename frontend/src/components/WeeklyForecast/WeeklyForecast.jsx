import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertCircle, Calendar, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import { getWeekForecast } from '../../services/api'
import { getWeekSnapshot } from '../../services/snapshots'
import {
  formatInr,
  formatSignedUsd,
  formatUsd,
  loadSnapshotFirst,
  normalizeWeek,
} from '../../utils/marketData'

function TrendPill({ direction }) {
  if (direction === 'up') {
    return <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-400"><TrendingUp size={12} /> Rise</span>
  }
  if (direction === 'down') {
    return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400"><TrendingDown size={12} /> Fall</span>
  }
  return <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300">Stable</span>
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-sm">
      <p className="mb-2 text-sm font-semibold text-amber-300">
        {row.dayLabel} | {row.date}
      </p>
      <div className="space-y-1.5 text-xs text-slate-200">
        <p>USD/oz: <span className="price-number font-semibold">{formatUsd(row.usd)}</span></p>
        <p>24k/g: <span className="price-number font-semibold">{formatInr(row.price_24k_per_gram)}</span></p>
        <p>22k/g: <span className="price-number font-semibold">{formatInr(row.price_22k_per_gram)}</span></p>
        <p>Move vs today: <span className="price-number font-semibold">{formatSignedUsd(row.direction_delta_usd)}</span> ({row.direction_delta_pct > 0 ? '+' : ''}{(row.direction_delta_pct || 0).toFixed(2)}%)</p>
        {row.market_status === 'market_closed' && (
          <p className="text-amber-300">Market closed carry-forward</p>
        )}
      </div>
    </div>
  )
}

export default function WeeklyForecast() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const hydrate = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true)
      setError(false)
    }

    try {
      const week = await loadSnapshotFirst(
        getWeekSnapshot,
        getWeekForecast,
        normalizeWeek,
        (result) => Array.isArray(result?.forecast) && result.forecast.length > 0,
      )
      setData(week.forecast)
      setLoading(false)
      setError(false)
    } catch {
      setLoading(false)
      setError(true)
    }
  }

  useEffect(() => {
    hydrate()
  }, [])

  const chartData = useMemo(() => (
    data.map((row) => ({
      ...row,
      label: `${row.day} ${row.date.slice(5)}`,
      dayLabel: row.day,
      low_usd: row.confidence_interval?.lower_usd ?? null,
      high_usd: row.confidence_interval?.upper_usd ?? null,
    }))
  ), [data])

  const chartBounds = useMemo(() => {
    const values = []
    chartData.forEach((row) => {
      if (row.usd != null) values.push(row.usd)
      if (row.low_usd != null) values.push(row.low_usd)
      if (row.high_usd != null) values.push(row.high_usd)
      if (row.reference_live_usd != null) values.push(row.reference_live_usd)
    })

    if (!values.length) {
      return { min: 0, max: 100 }
    }

    const minValue = Math.min(...values)
    const maxValue = Math.max(...values)
    const spread = Math.max(maxValue - minValue, maxValue * 0.0025)
    const padding = spread * 0.35
    return {
      min: Math.max(0, minValue - padding),
      max: maxValue + padding,
    }
  }, [chartData])

  const todayReference = chartData[0]?.reference_live_usd ?? null

  if (loading && !data.length) {
    return (
      <div className="card-premium flex h-72 items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    )
  }

  if (error && !data.length) {
    return (
      <div className="card-premium flex h-72 flex-col items-center justify-center gap-3 p-8">
        <AlertCircle size={32} className="text-slate-600" />
        <p className="text-sm text-slate-400">Weekly forecast unavailable</p>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card-premium p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10">
            <Calendar size={18} className="text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Weekly Forecast</h2>
            <p className="text-xs text-slate-500">Monday to Sunday with a single USD/oz view and INR estimates in the table.</p>
          </div>
        </div>

        <button
          onClick={() => hydrate({ silent: Boolean(data.length) })}
          className="rounded-lg p-2 text-slate-600 transition-all hover:bg-amber-500/10 hover:text-amber-400"
          title="Refresh weekly forecast"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-amber-300">USD / oz chart</span>
        <span>Today&apos;s live reference: <span className="price-number text-slate-200">{formatUsd(todayReference)}</span></span>
      </div>

      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 12, right: 16, left: -12, bottom: 8 }}>
            <defs>
              <linearGradient id="weeklyArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.22} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={84}
              domain={[chartBounds.min, chartBounds.max]}
              tickFormatter={(value) => `$${Math.round(value)}`}
            />
            <Tooltip content={<CustomTooltip />} />
            {todayReference != null && (
              <ReferenceLine y={todayReference} stroke="#94a3b8" strokeDasharray="5 5" />
            )}
            <Area
              type="monotone"
              dataKey="usd"
              stroke="#f59e0b"
              strokeWidth={2.6}
              fill="url(#weeklyArea)"
              activeDot={{ r: 5, fill: '#f59e0b', stroke: '#0a0f1e', strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="low_usd"
              stroke="#64748b"
              strokeDasharray="5 4"
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="high_usd"
              stroke="#64748b"
              strokeDasharray="5 4"
              dot={false}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/40 text-left text-xs text-slate-500">
              <th className="pb-3 pr-4 font-medium">Day</th>
              <th className="pb-3 pr-4 font-medium">USD/oz</th>
              <th className="pb-3 pr-4 font-medium">24k / g</th>
              <th className="pb-3 pr-4 font-medium">22k / g</th>
              <th className="pb-3 font-medium">Move vs today</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((row) => (
              <tr key={row.date} className="border-b border-slate-800/40 align-top">
                <td className="py-3 pr-4">
                  <p className="font-medium text-white">{row.day}</p>
                  <p className="text-xs text-slate-500">{row.date}</p>
                  {row.market_status === 'market_closed' && (
                    <p className="mt-1 text-[11px] text-amber-300">Closed day carry-forward</p>
                  )}
                </td>
                <td className="price-number py-3 pr-4 text-white">{formatUsd(row.usd)}</td>
                <td className="price-number py-3 pr-4 text-amber-300">{formatInr(row.price_24k_per_gram)}</td>
                <td className="price-number py-3 pr-4 text-slate-200">{formatInr(row.price_22k_per_gram)}</td>
                <td className="py-3">
                  <p className="price-number text-white">{formatSignedUsd(row.direction_delta_usd)}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {row.direction_delta_pct > 0 ? '+' : ''}{(row.direction_delta_pct || 0).toFixed(2)}%
                  </p>
                  <div className="mt-1">
                    <TrendPill direction={row.direction_vs_today} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-center text-[10px] text-slate-600">
        24k and 22k are India-facing estimates built from the international gold price, USD/INR, customs duty, GST, and benchmark premium assumptions.
      </p>
    </motion.div>
  )
}
