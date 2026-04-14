import { Link, useLocation, useNavigate } from 'react-router-dom'
import { TrendingUp } from 'lucide-react'
import { HOME_NAV_ITEMS, navigateToHomeSection } from '../../utils/siteNavigation'

export default function SiteFooter() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <footer className="border-t border-slate-800/60 py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center">
              <TrendingUp size={12} className="text-white" />
            </div>
            <span className="text-sm font-semibold">
              <span className="gold-text">Gold</span>
              <span className="text-white">Sense</span>
            </span>
          </Link>

          <p className="text-center text-xs text-slate-600">
            Copyright 2026 GoldSense. Public prices are labelled by source and freshness. Forecasts are estimates, not guarantees.
          </p>

          <div className="flex gap-4 text-xs text-slate-500">
            {HOME_NAV_ITEMS.map((item) => (
              <button
                key={item.label}
                onClick={() => navigateToHomeSection(navigate, location, item.hash)}
                className="transition-colors hover:text-amber-400"
              >
                {item.label}
              </button>
            ))}
            <Link to="/learn" className="transition-colors hover:text-amber-400">Learn</Link>
            <Link to="/dev" className="transition-colors hover:text-amber-400">Dev</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
