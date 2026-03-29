import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts'
import { Calendar, AlertCircle, Gem } from 'lucide-react'
import { getWeekForecast, getPredictionTomorrow } from '../../services/api'

const VIEW_OPTIONS = [
  { key: 'usd', label: 'USD/oz', dataKey: 'usd', color: '#F59E0B', format: v => `$${v?.toLocaleString()}` },
  { key: 'inr24k', label: '24k INR/g', dataKey: 'price_24k_per_gram', color: '#FCD34D', format: v => `₹${v?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` },
  { key: 'inr22k', label: '22k INR/g', dataKey: 'price_22k_per_gram', color: '#c084fc', format: v => `₹${v?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` },
]

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-slate-900/95 border border-amber-500/20 rounded-xl p-4 shadow-2xl backdrop-blur-sm">
      <p className="text-amber-400 font-semibold text-sm mb-2">{d.day}, {label}</p>
      <div className="space-y-1.5">
        <p className="text-white text-sm">USD: <span className="price-number font-bold">${d.usd?.toLocaleString()}</span></p>
        <div className="flex gap-3">
          <p className="text-amber-300 text-xs flex items-center gap-1">
            <Gem size={9} /> 24k: <span className="price-number font-medium">₹{d.price_24k_per_gram?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          </p>
          <p className="text-purple-300 text-xs flex items-center gap-1">
            <Gem size={9} /> 22k: <span className="price-number font-medium">₹{d.price_22k_per_gram?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          </p>
        </div>
      </div>
    </div>
  )
}

function getWeekToShow() {
  const today = new Date()
  const dow = today.getDay()
  const monday = new Date(today)
  if (dow === 0) monday.setDate(today.getDate() + 1)
  else if (dow === 6) monday.setDate(today.getDate() + 2)
  else monday.setDate(today.getDate() - (dow - 1))
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function toDateStr(d) { return d.toISOString().split('T')[0] }

export default function WeeklyForecast() {
  const [forecast, setForecast] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [lastActual, setLastActual] = useState(null)
  const [view, setView] = useState('usd')

  useEffect(() => {
    Promise.all([getWeekForecast(), getPredictionTomorrow()])
      .then(([weekData, todayData]) => {
        setForecast(weekData.forecast || [])
        setLastActual(todayData?.last_actual_usd)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  const activeView = VIEW_OPTIONS.find(v => v.key === view)

  if (loading) {
    return (
      <div className="card-premium p-8 flex items-center justify-center h-72">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="card-premium p-8 flex flex-col items-center justify-center h-72 gap-3">
        <AlertCircle size={32} className="text-slate-600" />
        <p className="text-slate-400 text-sm">Forecast unavailable</p>
      </div>
    )
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weekDays = getWeekToShow()

  const chartData = weekDays.map(d => {
    const dateStr = toDateStr(d)
    const fe = forecast.find(f => f.date === dateStr)
    const isPast = d <= today
    return {
      date: dateStr,
      date_short: dateStr.slice(5),
      day: d.toLocaleDateString('en-US', { weekday: 'short' }),
      isForecast: !!fe,
      isPast,
      usd: fe?.usd ?? (isPast ? lastActual : null),
      price_24k_per_gram: fe?.price_24k_per_gram ?? null,
      price_22k_per_gram: fe?.price_22k_per_gram ?? null,
      price_24k_per_10g: fe?.price_24k_per_10g ?? null,
      price_22k_per_10g: fe?.price_22k_per_10g ?? null,
      ci_lower_24k: fe?.ci_lower_24k ?? null,
      ci_upper_24k: fe?.ci_upper_24k ?? null,
    }
  })

  const vals = chartData.map(d => d[activeView.dataKey]).filter(Boolean)
  const ciL = view === 'inr24k' ? chartData.map(d => d.ci_lower_24k).filter(Boolean) : []
  const ciH = view === 'inr24k' ? chartData.map(d => d.ci_upper_24k).filter(Boolean) : []
  const allVals = [...vals, ...ciL, ...ciH]
  const minVal = allVals.length ? Math.min(...allVals) * 0.997 : 0
  const maxVal = allVals.length ? Math.max(...allVals) * 1.003 : 100
  const hasCI = view === 'inr24k' && ciL.length > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="card-premium p-6 md:p-8"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-500/10 rounded-xl flex items-center justify-center">
            <Calendar size={17} className="text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">7-Day Forecast</h2>
            <p className="text-[11px] text-slate-600">Mon-Fri | Past = actual | Future = AI</p>
          </div>
        </div>

        <div className="flex bg-slate-800/60 rounded-lg p-0.5 gap-0.5">
          {VIEW_OPTIONS.map(opt => (
            <button key={opt.key} onClick={() => setView(opt.key)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                view === opt.key
                  ? opt.key === 'inr22k' ? 'bg-purple-500 text-white' : 'bg-amber-500 text-black'
                  : 'text-slate-500 hover:text-white'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-56 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={activeView.color} stopOpacity={0.2} />
                <stop offset="95%" stopColor={activeView.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="date_short" tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis
              domain={[minVal, maxVal]}
              tick={{ fill: '#475569', fontSize: 10 }}
              tickLine={false} axisLine={false}
              tickFormatter={v => view === 'usd' ? `$${(v/1000).toFixed(1)}k` : `₹${(v/1000).toFixed(0)}k`}
              width={52}
            />
            <Tooltip content={<CustomTooltip />} />
            {lastActual && view === 'usd' && (
              <ReferenceLine y={lastActual} stroke="#334155" strokeDasharray="4 4"
                label={{ value: 'Last actual', fill: '#475569', fontSize: 9, position: 'right' }} />
            )}
            {hasCI && (
              <>
                <Area type="monotone" dataKey="ci_upper_24k" stroke="none" fill={activeView.color}
                  fillOpacity={0.06} dot={false} activeDot={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="ci_lower_24k" stroke="none" fill="#0a0f1e"
                  fillOpacity={1} dot={false} activeDot={false} isAnimationActive={false} />
              </>
            )}
            <Area type="monotone" dataKey={activeView.dataKey} stroke={activeView.color} strokeWidth={2}
              fill="url(#chartGradient)"
              dot={{ fill: activeView.color, r: 3.5, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: activeView.color, stroke: '#0a0f1e', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Day pills — both 24k and 22k */}
      <div className="grid grid-cols-5 gap-1.5 mt-4">
        {chartData.map((d, i) => {
          const v24 = d.price_24k_per_gram
          const v22 = d.price_22k_per_gram
          const usd = d.usd
          const prev = i > 0 ? chartData[i-1][activeView.dataKey] : d[activeView.dataKey]
          const curr = d[activeView.dataKey]
          const isUp = curr != null && prev != null && curr > prev

          return (
            <div key={d.date} className="text-center rounded-lg bg-slate-800/30 py-2 px-1">
              <p className="text-[10px] text-slate-600 mb-1">{d.day}</p>
              {usd != null ? (
                <>
                  <p className={`text-[11px] font-semibold price-number ${
                    d.isPast && !d.isForecast ? 'text-slate-500' : isUp ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {view === 'usd'
                      ? `$${(usd / 1000).toFixed(2)}k`
                      : view === 'inr22k'
                        ? `₹${v22 ? (v22 / 1000).toFixed(1) : '—'}k`
                        : `₹${v24 ? (v24 / 1000).toFixed(1) : '—'}k`
                    }
                  </p>
                  {/* Show the other karat below */}
                  {view !== 'usd' && (
                    <p className="text-[9px] text-slate-600 mt-0.5 price-number">
                      {view === 'inr24k'
                        ? `22k: ₹${v22 ? (v22 / 1000).toFixed(1) : '—'}k`
                        : `24k: ₹${v24 ? (v24 / 1000).toFixed(1) : '—'}k`
                      }
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-slate-700">—</p>
              )}
              {d.isForecast && <p className="text-[8px] text-amber-600 mt-0.5">AI</p>}
              {d.isPast && !d.isForecast && usd != null && <p className="text-[8px] text-slate-700 mt-0.5">actual</p>}
            </div>
          )
        })}
      </div>

      <p className="text-[10px] text-slate-700 mt-4 text-center">
        Recursive XGBoost forecast {hasCI ? '| Shaded = 80% confidence ' : ''}| Accuracy decreases for days 4-7 | Not financial advice
      </p>
    </motion.div>
  )
}
