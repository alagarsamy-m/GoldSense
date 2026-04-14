import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, LogIn, Menu, TrendingUp, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../hooks/useAuth'
import { HOME_NAV_ITEMS, navigateToHomeSection } from '../../utils/siteNavigation'

const PAGE_LINKS = [
  { label: 'Learn', to: '/learn' },
  { label: 'Dev', to: '/dev' },
]

function NavLink({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active ? 'text-amber-300' : 'text-slate-300 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

export default function Navbar() {
  const { user, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname, location.hash])

  const handleSectionClick = (hash) => {
    navigateToHomeSection(navigate, location, hash)
  }

  const handleLogin = async () => {
    try {
      await signInWithGoogle()
    } catch {
      toast.error('Login failed. Please try again.')
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-amber-500/10 bg-slate-950/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 shadow-lg shadow-amber-500/20">
            <TrendingUp size={18} className="text-white" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-amber-300/80">Gold Forecasting Intelligence</p>
            <p className="text-lg font-black">
              <span className="gold-text">Gold</span>
              <span className="text-white">Sense</span>
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {HOME_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.label}
              active={location.pathname === '/' && location.hash === item.hash}
              onClick={() => handleSectionClick(item.hash)}
            >
              {item.label}
            </NavLink>
          ))}
          {PAGE_LINKS.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                location.pathname === item.to ? 'text-amber-300' : 'text-slate-300 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {user ? (
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/15"
            >
              <LayoutDashboard size={16} />
              Dashboard
            </Link>
          ) : (
            <button
              onClick={handleLogin}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition-transform hover:scale-[1.01]"
            >
              <LogIn size={16} />
              Sign In
            </button>
          )}
        </div>

        <button
          onClick={() => setMenuOpen((open) => !open)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-slate-200 lg:hidden"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="border-t border-amber-500/10 bg-slate-950/95 px-4 py-4 shadow-2xl lg:hidden"
          >
            <div className="mx-auto flex max-w-7xl flex-col gap-2">
              {HOME_NAV_ITEMS.map((item) => (
                <button
                  key={item.label}
                  onClick={() => handleSectionClick(item.hash)}
                  className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-left text-sm font-medium text-slate-200 transition-colors hover:border-amber-500/20 hover:text-white"
                >
                  {item.label}
                </button>
              ))}
              {PAGE_LINKS.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-amber-500/20 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
              {user ? (
                <Link
                  to="/dashboard"
                  className="mt-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950"
                >
                  <LayoutDashboard size={16} />
                  Dashboard
                </Link>
              ) : (
                <button
                  onClick={handleLogin}
                  className="mt-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950"
                >
                  <LogIn size={16} />
                  Sign In
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
