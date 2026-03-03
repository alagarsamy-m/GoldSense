import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, LogIn, LogOut, LayoutDashboard, Menu, X } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import toast from 'react-hot-toast'

export default function Navbar() {
  const { user, signInWithGoogle, signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async () => {
    try {
      await signInWithGoogle()
    } catch (err) {
      toast.error('Login failed. Please try again.')
    }
  }

  const handleLogout = async () => {
    try {
      await signOut()
      navigate('/')
      toast.success('Signed out successfully')
    } catch (err) {
      toast.error('Logout failed')
    }
  }

  const navLinks = [
    { label: 'Predictor', href: '/#predictor' },
    { label: 'Accuracy', href: '/#accuracy' },
    { label: 'Learn', href: '/#education' },
    { label: 'Dev Docs', href: '/#devdocs' },
  ]

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-slate-800/60 bg-slate-950/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <TrendingUp size={16} className="text-white" />
            </div>
            <span className="text-lg font-bold">
              <span className="gold-text">Gold</span>
              <span className="text-white">Sense</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map(link => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-slate-400 hover:text-amber-400 transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Auth buttons */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/10 transition-all"
                >
                  <LayoutDashboard size={15} />
                  Dashboard
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
                >
                  <LogOut size={15} />
                  Sign Out
                </button>
              </>
            ) : (
              <button
                onClick={handleLogin}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-lg hover:from-amber-400 hover:to-orange-500 transition-all shadow-lg shadow-amber-500/20"
              >
                <LogIn size={15} />
                Sign In with Google
              </button>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden text-slate-400 hover:text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-slate-800 bg-slate-950/95 backdrop-blur-xl"
          >
            <div className="px-4 py-4 space-y-3">
              {navLinks.map(link => (
                <a
                  key={link.label}
                  href={link.href}
                  className="block text-sm text-slate-400 hover:text-amber-400 py-1"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              <div className="pt-2 border-t border-slate-800">
                {user ? (
                  <div className="flex flex-col gap-2">
                    <Link
                      to="/dashboard"
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-400 border border-amber-500/30 rounded-lg"
                      onClick={() => setMobileOpen(false)}
                    >
                      <LayoutDashboard size={15} />
                      Dashboard
                    </Link>
                    <button onClick={handleLogout} className="text-left text-sm text-slate-400 py-1">
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { handleLogin(); setMobileOpen(false) }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-lg"
                  >
                    <LogIn size={15} />
                    Sign In with Google
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}
