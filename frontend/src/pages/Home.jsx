import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { TrendingUp, TrendingDown, ChevronDown, LogIn, LayoutDashboard, Sparkles } from 'lucide-react'
import Navbar from '../components/Layout/Navbar'
import PricePredictor from '../components/PricePredictor/PricePredictor'
import WeeklyForecast from '../components/WeeklyForecast/WeeklyForecast'
import AccuracyLog from '../components/AccuracyLog/AccuracyLog'
import EducationSection from '../components/Education/EducationSection'
import DevDocs from '../components/Education/DevDocs'
import { useAuth } from '../hooks/useAuth'
import { getLiveTodayPrice } from '../services/api'
import toast from 'react-hot-toast'

// Animated hero background particles
function HeroParticles() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animId

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 2 + 0.5,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.5 + 0.1,
    }))

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particles.forEach(p => {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(245, 158, 11, ${p.alpha})`
        ctx.fill()
      })
      animId = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animId)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
}

export default function Home() {
  const { user, signInWithGoogle } = useAuth()
  const [heroPriceToday, setHeroPriceToday] = useState(null)

  useEffect(() => {
    getLiveTodayPrice().then(setHeroPriceToday).catch(() => {})
  }, [])

  const handleLogin = async () => {
    try {
      await signInWithGoogle()
    } catch {
      toast.error('Login failed. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Navbar />

      {/* ── Hero Section ──────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center overflow-hidden pt-16">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(245,158,11,0.08),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(234,88,12,0.06),transparent_60%)]" />
        <HeroParticles />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left: Text */}
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Sparkles size={14} className="text-amber-400" />
                <span className="text-xs text-amber-400 font-semibold uppercase tracking-widest">
                  AI-Powered Gold Intelligence
                </span>
              </div>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-white leading-[0.95] mb-6">
                Predict <span className="gold-text">Gold.</span>
                <br />
                Invest <span className="gold-text">Smart.</span>
              </h1>
              <p className="text-lg text-slate-400 mb-8 leading-relaxed max-w-lg">
                GoldSense uses XGBoost AI trained on 26 years of gold price data to predict
                tomorrow's gold price in USD and India — 24k & 22k per gram in Chennai.
              </p>
              <div className="flex flex-wrap gap-4">
                <a
                  href="#predictor"
                  className="flex items-center gap-2 px-6 py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold rounded-xl hover:from-amber-400 hover:to-orange-500 transition-all shadow-lg shadow-amber-500/25"
                >
                  <TrendingUp size={18} />
                  See Tomorrow's Prediction
                </a>
                {user ? (
                  <Link
                    to="/dashboard"
                    className="flex items-center gap-2 px-6 py-3.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-amber-500/30 text-white font-semibold rounded-xl transition-all"
                  >
                    <LayoutDashboard size={18} />
                    My Dashboard
                  </Link>
                ) : (
                  <button
                    onClick={handleLogin}
                    className="flex items-center gap-2 px-6 py-3.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-amber-500/30 text-white font-semibold rounded-xl transition-all"
                  >
                    <LogIn size={18} />
                    Sign In for Personalized Advice
                  </button>
                )}
              </div>

              {/* Stats */}
              <div className="flex flex-wrap gap-8 mt-10">
                {[
                  { label: 'Years of Data', value: '26+' },
                  { label: 'Trading Days', value: '6,500+' },
                  { label: 'Retrained', value: 'Weekly' },
                  { label: 'Forecast', value: '7-Day' },
                ].map(stat => (
                  <div key={stat.label}>
                    <p className="price-number text-2xl font-bold text-amber-400">{stat.value}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Right: Quick preview card */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="lg:block"
            >
              <div className="relative">
                <div className="absolute -inset-4 bg-gradient-to-r from-amber-500/20 to-orange-500/10 rounded-3xl blur-2xl" />
                <div className="relative bg-gradient-to-br from-slate-900 to-slate-800 border border-amber-500/20 rounded-2xl p-6 shadow-2xl">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-semibold text-amber-400 uppercase tracking-widest">Today's Gold Price</span>
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  </div>
                  {heroPriceToday ? (
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Gold USD / troy oz — {heroPriceToday.date}</p>
                        <p className="price-number text-4xl font-black text-white">
                          ${Math.floor(heroPriceToday.live_usd).toLocaleString()}
                          <span className="text-amber-400">.{String(heroPriceToday.live_usd.toFixed(2)).split('.')[1]}</span>
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-800/60 rounded-xl p-3">
                          <p className="text-xs text-slate-500 mb-1">24k / gram</p>
                          <p className="price-number text-lg font-bold text-amber-400">
                            ₹{Number(heroPriceToday.price_24k_per_gram).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </p>
                        </div>
                        <div className="bg-slate-800/60 rounded-xl p-3">
                          <p className="text-xs text-slate-500 mb-1">22k / gram</p>
                          <p className="price-number text-lg font-bold text-white">
                            ₹{Number(heroPriceToday.price_22k_per_gram).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>USD/INR: <span className="text-slate-300 price-number">₹{heroPriceToday.usd_inr_rate}</span></span>
                        <span className="text-slate-600">•</span>
                        <span>Live via Yahoo Finance</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="h-10 bg-slate-700/50 rounded-lg animate-pulse" />
                      <div className="grid grid-cols-2 gap-3">
                        <div className="h-16 bg-slate-800/60 rounded-xl animate-pulse" />
                        <div className="h-16 bg-slate-800/60 rounded-xl animate-pulse" />
                      </div>
                      <div className="h-5 bg-slate-700/50 rounded animate-pulse w-2/3" />
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Scroll indicator */}
        <motion.a
          href="#predictor"
          animate={{ y: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-slate-600 hover:text-amber-400 transition-colors"
        >
          <ChevronDown size={28} />
        </motion.a>
      </section>

      {/* ── Predictor Section ─────────────────────────────────────────────── */}
      <section id="predictor" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-8"
          >
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-widest">Core Prediction Engine</span>
            <h2 className="text-3xl font-bold text-white mt-2">
              Tomorrow's Gold Price — <span className="gold-text">AI Forecast</span>
            </h2>
          </motion.div>
          <PricePredictor />
        </div>
      </section>

      {/* ── 7-Day Forecast ────────────────────────────────────────────────── */}
      <section className="pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <WeeklyForecast />
        </div>
      </section>

      {/* ── Accuracy Log ─────────────────────────────────────────────────── */}
      <section id="accuracy" className="pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AccuracyLog />
        </div>
      </section>

      {/* ── Education ────────────────────────────────────────────────────── */}
      <EducationSection />

      {/* ── CTA for Auth ─────────────────────────────────────────────────── */}
      {!user && (
        <section className="py-20 bg-gradient-to-r from-amber-500/5 via-amber-500/10 to-orange-500/5">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Unlock <span className="gold-text">Personalized</span> Gold Intelligence
              </h2>
              <p className="text-slate-400 text-lg mb-8 max-w-2xl mx-auto">
                Sign in to get AI-powered buy/sell recommendations tailored to your portfolio,
                investment goals, and risk appetite — plus access to the AI chatbot.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10 text-left max-w-2xl mx-auto">
                {[
                  { emoji: '🤖', title: 'AI Recommendations', desc: 'Groq LLM-powered buy/sell/hold advice' },
                  { emoji: '💼', title: 'Portfolio Tracker', desc: 'Track your gold holdings in real-time' },
                  { emoji: '💬', title: 'AI Chatbot', desc: 'Ask anything about gold investments' },
                ].map(f => (
                  <div key={f.title} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                    <p className="text-2xl mb-2">{f.emoji}</p>
                    <p className="text-white font-semibold text-sm mb-1">{f.title}</p>
                    <p className="text-slate-400 text-xs">{f.desc}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={handleLogin}
                className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold text-lg rounded-xl hover:from-amber-400 hover:to-orange-500 transition-all shadow-xl shadow-amber-500/25"
              >
                <svg viewBox="0 0 48 48" className="w-5 h-5">
                  <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
                  <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
                  <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
                  <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
                </svg>
                Continue with Google — It's Free
              </button>
              <p className="mt-4 text-xs text-slate-600">No credit card required • Google authentication only</p>
            </motion.div>
          </div>
        </section>
      )}

      {/* ── Dev Docs ─────────────────────────────────────────────────────── */}
      <DevDocs />

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/60 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center">
                <TrendingUp size={12} className="text-white" />
              </div>
              <span className="text-sm font-semibold"><span className="gold-text">Gold</span><span className="text-white">Sense</span></span>
            </div>
            <p className="text-xs text-slate-600 text-center">
              © 2026 GoldSense • AI predictions are not financial advice • Data from investing.com &amp; Yahoo Finance
            </p>
            <div className="flex gap-4 text-xs text-slate-600">
              <a href="#predictor" className="hover:text-amber-400 transition-colors">Predictor</a>
              <a href="#education" className="hover:text-amber-400 transition-colors">Learn</a>
              <a href="#devdocs" className="hover:text-amber-400 transition-colors">Docs</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
