import { useState, useEffect, useRef } from 'react'
import { TrendingUp, TrendingDown, Gem } from 'lucide-react'
import { getLiveTodayPrice } from '../../services/api'

const REFRESH_MS = 5 * 60 * 1000

export default function LiveTicker() {
  const [data, setData] = useState(null)
  const [prevPrice, setPrevPrice] = useState(null)
  const [flash, setFlash] = useState(false)
  const intervalRef = useRef(null)

  const fetchPrice = async () => {
    try {
      const result = await getLiveTodayPrice()
      if (result) {
        setPrevPrice(data?.live_usd || null)
        setData(result)
        setFlash(true)
        setTimeout(() => setFlash(false), 800)
      }
    } catch { /* non-critical */ }
  }

  useEffect(() => {
    fetchPrice()
    intervalRef.current = setInterval(fetchPrice, REFRESH_MS)
    return () => clearInterval(intervalRef.current)
  }, [])

  if (!data) return null

  const change = prevPrice ? data.live_usd - prevPrice : 0
  const isUp = change > 0

  const fmt = (v) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

  return (
    <div className="w-full bg-gradient-to-r from-slate-900/98 via-slate-900/95 to-slate-900/98 border-b border-amber-500/10 backdrop-blur-md z-50">
      <div className="max-w-7xl mx-auto px-3 py-1.5 flex items-center gap-4 overflow-x-auto text-[11px]">
        {/* Live dot */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
          </span>
          <span className="text-green-400 font-bold tracking-widest uppercase text-[9px]">Live</span>
        </div>

        {/* Gold USD */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-slate-600">Gold</span>
          <span className={`font-bold price-number transition-colors duration-500 ${
            flash ? (isUp ? 'text-green-400' : 'text-red-400') : 'text-amber-400'
          }`}>
            ${data.live_usd?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          {change !== 0 && (isUp
            ? <TrendingUp size={9} className="text-green-400" />
            : <TrendingDown size={9} className="text-red-400" />
          )}
        </div>

        <span className="text-slate-800 hidden sm:inline">|</span>

        {/* 24k */}
        <div className="flex items-center gap-1 shrink-0 hidden sm:flex">
          <Gem size={8} className="text-amber-500/60" />
          <span className="text-amber-400/60">24k</span>
          <span className="text-white font-semibold price-number">{fmt(data.price_24k_per_gram)}</span>
          <span className="text-slate-600">/g</span>
        </div>

        <span className="text-slate-800 hidden sm:inline">|</span>

        {/* 22k */}
        <div className="flex items-center gap-1 shrink-0 hidden sm:flex">
          <Gem size={8} className="text-purple-500/60" />
          <span className="text-purple-400/60">22k</span>
          <span className="text-slate-200 font-semibold price-number">{fmt(data.price_22k_per_gram)}</span>
          <span className="text-slate-600">/g</span>
        </div>

        <span className="text-slate-800 hidden md:inline">|</span>

        {/* USD/INR */}
        <div className="flex items-center gap-1 shrink-0 hidden md:flex">
          <span className="text-slate-600">USD/INR</span>
          <span className="text-slate-400 price-number">₹{data.usd_inr_rate}</span>
        </div>

        {/* Spacer + update indicator */}
        <span className="ml-auto text-slate-700 shrink-0 hidden sm:inline">auto-refresh 5m</span>
      </div>
    </div>
  )
}
