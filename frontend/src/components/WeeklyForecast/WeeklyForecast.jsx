import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Area, AreaChart
} from 'recharts'
import { Calendar, TrendingUp, AlertCircle } from 'lucide-react'
import { getWeekForecast, getPredictionTomorrow } from '../../services/api'

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    const d = payload[0].payload
    return (
      <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-4 shadow-xl">
        <p className="text-amber-400 font-semibold mb-2">{d.day}, {label}</p>
        <p className="text-white text-sm">USD: <span className="price-number font-bold">${d.usd?.toLocaleString()}</span></p>
        <p className="text-slate-300 text-sm">24k/g: <span className="price-number">₹{d.price_24k_per_gram?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></p>
        <p className="text-slate-400 text-sm">22k/g: <span className="price-number">₹{d.price_22k_per_gram?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></p>
      </div>
    )
  }
  return null
}

// Returns Mon–Fri of the current week (or next week if weekend)
function getWeekToShow() {
  const today = new Date()
  const dow = today.getDay() // 0=Sun … 6=Sat
  const monday = new Date(today)
  if (dow === 0) monday.setDate(today.getDate() + 1)        // Sun → next Mon
  else if (dow === 6) monday.setDate(today.getDate() + 2)  // Sat → next Mon
  else monday.setDate(today.getDate() - (dow - 1))         // Mon–Fri → this Mon
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function toDateStr(d) {
  return d.toISOString().split('T')[0]
}

export default function WeeklyForecast() {
  const [forecast, setForecast] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [lastActual, setLastActual] = useState(null)
  const [view, setView] = useState('usd') // 'usd' | 'inr24k' | 'inr22k'

  useEffect(() => {
    const load = async () => {
      try {
        const [weekData, todayData] = await Promise.all([
          getWeekForecast(),
          getPredictionTomorrow()
        ])
        setForecast(weekData.forecast || [])
        setLastActual(todayData?.last_actual_usd)
        setError(false)
      } catch (err) {
        console.error('Failed to load forecast', err)
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const viewOptions = [
    { key: 'usd', label: 'USD / oz', dataKey: 'usd', color: '#F59E0B', format: v => `$${v?.toLocaleString()}` },
    { key: 'inr24k', label: '24k INR/g', dataKey: 'price_24k_per_gram', color: '#c084fc', format: v => `₹${v?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` },
    { key: 'inr22k', label: '22k INR/g', dataKey: 'price_22k_per_gram', color: '#60a5fa', format: v => `₹${v?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` },
  ]

  const activeView = viewOptions.find(v => v.key === view)

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-8 gold-border flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass-card rounded-2xl p-8 gold-border flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle size={32} className="text-slate-600" />
        <p className="text-slate-400 text-sm">Forecast unavailable</p>
        <p className="text-slate-600 text-xs">Backend may be starting up — try refreshing in a moment</p>
      </div>
    )
  }

  // Build a Mon–Fri week view, matching forecast entries to their dates
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weekDays = getWeekToShow()

  const chartData = weekDays.map(d => {
    const dateStr = toDateStr(d)
    const forecastEntry = forecast.find(f => f.date === dateStr)
    const isPastOrToday = d <= today
    return {
      date: dateStr,
      date_short: dateStr.slice(5),
      day: d.toLocaleDateString('en-US', { weekday: 'short' }),
      isForecast: !!forecastEntry,
      isPast: isPastOrToday,
      usd: forecastEntry?.usd ?? (isPastOrToday ? lastActual : null),
      price_24k_per_gram: forecastEntry?.price_24k_per_gram ?? null,
      price_22k_per_gram: forecastEntry?.price_22k_per_gram ?? null,
      price_24k_per_10g: forecastEntry?.price_24k_per_10g ?? null,
      price_22k_per_10g: forecastEntry?.price_22k_per_10g ?? null,
    }
  })

  const validVals = chartData.map(d => d[activeView.dataKey]).filter(Boolean)
  const minVal = validVals.length ? Math.min(...validVals) * 0.998 : 0
  const maxVal = validVals.length ? Math.max(...validVals) * 1.002 : 100

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="glass-card rounded-2xl p-6 md:p-8 gold-border"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-500/15 rounded-lg flex items-center justify-center">
            <Calendar size={18} className="text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">This Week's Forecast</h2>
            <p className="text-xs text-slate-500">Mon–Fri • Past = actual • Future = AI prediction</p>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex bg-slate-800/80 rounded-lg p-1 gap-1">
          {viewOptions.map(opt => (
            <button
              key={opt.key}
              onClick={() => setView(opt.key)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                view === opt.key
                  ? 'bg-amber-500 text-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-52 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={activeView.color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={activeView.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="date_short"
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[minVal, maxVal]}
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => activeView.key === 'usd' ? `$${(v/1000).toFixed(1)}k` : `₹${(v/1000).toFixed(0)}k`}
              width={55}
            />
            <Tooltip content={<CustomTooltip />} />
            {lastActual && view === 'usd' && (
              <ReferenceLine
                y={lastActual}
                stroke="#64748b"
                strokeDasharray="4 4"
                label={{ value: 'Last actual', fill: '#64748b', fontSize: 10, position: 'right' }}
              />
            )}
            <Area
              type="monotone"
              dataKey={activeView.dataKey}
              stroke={activeView.color}
              strokeWidth={2}
              fill="url(#goldGradient)"
              dot={{ fill: activeView.color, r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: activeView.color, stroke: '#0f172a', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Day pills — Mon to Fri of current week */}
      <div className="grid grid-cols-5 gap-1 mt-4">
        {chartData.map((d, i) => {
          const val = d[activeView.dataKey]
          const prev = i > 0 ? chartData[i-1][activeView.dataKey] : val
          const isUp = val != null && prev != null && val > prev
          return (
            <div key={d.date} className="text-center">
              <p className={`text-xs mb-1 ${d.isPast && !d.isForecast ? 'text-slate-600' : 'text-slate-500'}`}>{d.day}</p>
              {val != null ? (
                <p className={`text-xs font-semibold price-number ${d.isPast && !d.isForecast ? 'text-slate-500' : isUp ? 'text-green-400' : 'text-red-400'}`}>
                  {activeView.key === 'usd'
                    ? `$${(val/1000).toFixed(2)}k`
                    : `₹${(val/1000).toFixed(0)}k`}
                </p>
              ) : (
                <p className="text-xs text-slate-700">—</p>
              )}
              {d.isPast && !d.isForecast && val != null && (
                <p className="text-[10px] text-slate-600">actual</p>
              )}
              {d.isForecast && (
                <p className="text-[10px] text-amber-600">AI</p>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-slate-600 mt-4 text-center">
        Recursive XGBoost forecast • Accuracy decreases for days 4–7 • Not financial advice
      </p>
    </motion.div>
  )
}
