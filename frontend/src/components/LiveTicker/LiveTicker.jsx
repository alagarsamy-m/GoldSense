import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { getLiveTodayPrice } from '../../services/api'
import { getTodaySnapshot } from '../../services/snapshots'
import { formatInr, formatUsd, loadSnapshotFirst, normalizeToday } from '../../utils/marketData'

const REFRESH_MS = 5 * 1000

export default function LiveTicker() {
  const location = useLocation()
  const [data, setData] = useState(null)
  const [flash, setFlash] = useState(false)
  const previousUsd = useRef(null)
  const currentUsd = useRef(null)
  const isDashboardRoute = location.pathname.startsWith('/dashboard')

  useEffect(() => {
    let active = true
    let flashTimeout = null

    const setTickerData = (payload) => {
      if (!active || !payload?.live_usd) return
      const nextUsd = payload.live_usd
      const lastUsd = currentUsd.current
      const hasPriceChanged = lastUsd != null && Math.abs(nextUsd - lastUsd) > 0.0001

      previousUsd.current = lastUsd
      currentUsd.current = nextUsd
      setData(payload)

      if (!hasPriceChanged) {
        setFlash(false)
        if (flashTimeout) {
          window.clearTimeout(flashTimeout)
          flashTimeout = null
        }
        return
      }

      setFlash(true)
      if (flashTimeout) window.clearTimeout(flashTimeout)
      flashTimeout = window.setTimeout(() => {
        setFlash(false)
        flashTimeout = null
      }, 900)
    }

    const hydrate = async () => {
      try {
        const snapshotData = await loadSnapshotFirst(
          getTodaySnapshot,
          getLiveTodayPrice,
          normalizeToday,
          (result) => result?.live_usd != null,
        )
        setTickerData(snapshotData)
      } catch {
        // Non-critical.
      }

      try {
        const liveData = normalizeToday(await getLiveTodayPrice())
        setTickerData(liveData)
      } catch {
        // Keep the snapshot value if live refresh fails.
      }
    }

    hydrate()
    const interval = window.setInterval(async () => {
      try {
        const liveData = normalizeToday(await getLiveTodayPrice())
        setTickerData(liveData)
      } catch {
        // Ignore background refresh failures.
      }
    }, REFRESH_MS)

    return () => {
      active = false
      if (flashTimeout) window.clearTimeout(flashTimeout)
      window.clearInterval(interval)
    }
  }, [])

  if (!data?.live_usd) return null

  const change = previousUsd.current != null ? data.live_usd - previousUsd.current : 0
  const isUp = change > 0
  const statusTone = data.market_status === 'live' ? 'text-green-400' : 'text-amber-400'
  const statusLabel = data.market_status === 'live'
    ? 'Live'
    : data.source === 'dataset_close'
      ? 'Delayed close'
      : 'Delayed'
  const sourceLabel = data.market_status === 'live'
    ? `${data.source} | auto-refresh 5s`
    : data.source === 'dataset_close'
      ? `last verified close | ${data.verified_date || data.date || '--'}`
      : `${data.source} | verified ${data.verified_date || data.date || '--'}`

  return (
    <div className="z-50 w-full border-b border-amber-500/10 bg-gradient-to-r from-slate-900/98 via-slate-900/95 to-slate-900/98 backdrop-blur-md">
      <div className={isDashboardRoute ? 'lg:pl-64' : ''}>
        <div className="mx-auto flex max-w-7xl items-center gap-4 overflow-x-auto px-3 py-1.5 text-[11px]" aria-live="polite">
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${data.market_status === 'live' ? 'bg-green-400' : 'bg-amber-400'} opacity-75`} />
              <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${data.market_status === 'live' ? 'bg-green-500' : 'bg-amber-500'}`} />
            </span>
            <span className={`text-[9px] font-bold uppercase tracking-widest ${statusTone}`}>
              {statusLabel}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-slate-600">Gold</span>
            <span
              className={`price-number font-bold transition-colors duration-500 ${
                flash ? (isUp ? 'text-green-400' : 'text-red-400') : 'text-amber-400'
              }`}
            >
              {formatUsd(data.live_usd)}
            </span>
            {change !== 0 && (isUp ? <TrendingUp size={9} className="text-green-400" /> : <TrendingDown size={9} className="text-red-400" />)}
          </div>

          <span className="hidden text-slate-800 sm:inline">|</span>

          <div className="hidden shrink-0 items-center gap-1 sm:flex">
            <span className="text-amber-400/70">24k</span>
            <span className="price-number font-semibold text-white">{formatInr(data.price_24k_per_gram)}</span>
            <span className="text-slate-600">/g</span>
          </div>

          <span className="hidden text-slate-800 sm:inline">|</span>

          <div className="hidden shrink-0 items-center gap-1 sm:flex">
            <span className="text-slate-400">22k</span>
            <span className="price-number font-semibold text-slate-200">{formatInr(data.price_22k_per_gram)}</span>
            <span className="text-slate-600">/g</span>
          </div>

          <span className="hidden text-slate-800 md:inline">|</span>

          <div className="hidden shrink-0 items-center gap-1 md:flex">
            <span className="text-slate-600">USD/INR</span>
            <span className="price-number text-slate-400">{data.usd_inr_rate}</span>
          </div>

          <span className="ml-auto hidden shrink-0 text-slate-700 sm:inline">
            {sourceLabel}
          </span>
        </div>
      </div>
    </div>
  )
}
