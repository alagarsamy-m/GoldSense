import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useLocation } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  ChevronDown,
  LayoutDashboard,
  LogIn,
  Sparkles,
  TrendingUp,
  Wrench,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Navbar from '../components/Layout/Navbar'
import SiteFooter from '../components/Layout/SiteFooter'
import PricePredictor from '../components/PricePredictor/PricePredictor'
import WeeklyForecast from '../components/WeeklyForecast/WeeklyForecast'
import AccuracyLog from '../components/AccuracyLog/AccuracyLog'
import { useAuth } from '../hooks/useAuth'
import { getLiveTodayPrice } from '../services/api'
import { getHomeSnapshot } from '../services/snapshots'
import { normalizeToday } from '../utils/marketData'
import { scrollToHash } from '../utils/siteNavigation'

function HeroParticles() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

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
      particles.forEach((particle) => {
        particle.x += particle.vx
        particle.y += particle.vy

        if (particle.x < 0) particle.x = canvas.width
        if (particle.x > canvas.width) particle.x = 0
        if (particle.y < 0) particle.y = canvas.height
        if (particle.y > canvas.height) particle.y = 0

        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(245, 158, 11, ${particle.alpha})`
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

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
}

export default function Home() {
  const location = useLocation()
  const { user, signInWithGoogle } = useAuth()
  const [heroPriceToday, setHeroPriceToday] = useState(null)
  const [heroError, setHeroError] = useState(false)

  useEffect(() => {
    let active = true

    getHomeSnapshot()
      .then((snapshot) => {
        if (!active) return null
        if (snapshot?.today?.live_usd) return normalizeToday(snapshot.today)
        throw new Error('snapshot-missing')
      })
      .catch(() => getLiveTodayPrice().then(normalizeToday))
      .then((data) => {
        if (!active || !data) return
        setHeroPriceToday(data)
        setHeroError(false)
      })
      .catch(() => {
        if (!active) return
        setHeroError(true)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!location.hash) return undefined

    const timer = window.setTimeout(() => {
      scrollToHash(location.hash)
    }, 80)

    return () => window.clearTimeout(timer)
  }, [location.hash])

  const handleLogin = async () => {
    try {
      await signInWithGoogle()
    } catch {
      toast.error('Login failed. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      <Navbar />

      <section className="relative min-h-screen overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0f1e] via-[#111827] to-[#0a0f1e]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(245,158,11,0.08),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(234,88,12,0.06),transparent_60%)]" />
        <HeroParticles />

        <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="mb-4 flex items-center gap-2">
              <Sparkles size={14} className="text-amber-400" />
              <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">
                AI-Powered Gold Intelligence
              </span>
            </div>

            <h1 className="mb-6 text-5xl font-black leading-[0.95] text-white sm:text-6xl lg:text-7xl">
              Predict <span className="gold-text">Gold.</span>
              <br />
              Decide <span className="gold-text">Faster.</span>
            </h1>

            <p className="mb-8 max-w-xl text-lg leading-relaxed text-slate-400">
              Instant public forecasts for tomorrow&apos;s estimated close, a Monday to Sunday weekly view, and India-facing gold estimates built from international spot, USD/INR, duty, and GST assumptions.
            </p>

            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => scrollToHash('#predictor')}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500"
              >
                <TrendingUp size={18} />
                See Tomorrow&apos;s Prediction
              </button>

              {user ? (
                <Link
                  to="/dashboard"
                  className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-6 py-3.5 font-semibold text-white transition-all hover:border-amber-500/30 hover:bg-slate-700"
                >
                  <LayoutDashboard size={18} />
                  My Dashboard
                </Link>
              ) : (
                <button
                  onClick={handleLogin}
                  className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-6 py-3.5 font-semibold text-white transition-all hover:border-amber-500/30 hover:bg-slate-700"
                >
                  <LogIn size={18} />
                  Sign In for Personalized Intelligence
                </button>
              )}
            </div>

            <div className="mt-10 flex flex-wrap gap-8">
              {[
                { label: 'Years of Data', value: '26+' },
                { label: 'Trading Days', value: '6,500+' },
                { label: 'Evaluated', value: 'Daily' },
                { label: 'Snapshot Delivery', value: 'Instant' },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="price-number text-2xl font-bold text-amber-400">{stat.value}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{stat.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="relative">
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-amber-500/20 to-orange-500/10 blur-2xl" />
              <div className="relative rounded-2xl border border-amber-500/20 bg-gradient-to-br from-slate-900 to-slate-800 p-6 shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">Today&apos;s Gold Price</span>
                  <span className="h-2 w-2 rounded-full bg-green-400" />
                </div>

                {heroPriceToday ? (
                  <div className="space-y-4">
                    <div>
                      <p className="mb-1 text-xs text-slate-500">Live last price - {heroPriceToday.date || heroPriceToday.verified_date}</p>
                      <p className="price-number text-4xl font-black text-white">
                        ${Number(heroPriceToday.live_usd).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-slate-800/60 p-3">
                        <p className="mb-1 text-xs text-slate-500">24k / gram</p>
                        <p className="price-number text-lg font-bold text-amber-400">
                          Rs {Number(heroPriceToday.price_24k_per_gram).toLocaleString('en-IN', {
                            maximumFractionDigits: 0,
                          })}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-800/60 p-3">
                        <p className="mb-1 text-xs text-slate-500">22k / gram</p>
                        <p className="price-number text-lg font-bold text-white">
                          Rs {Number(heroPriceToday.price_22k_per_gram).toLocaleString('en-IN', {
                            maximumFractionDigits: 0,
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>
                        USD/INR: <span className="price-number text-slate-300">{heroPriceToday.usd_inr_rate}</span>
                      </span>
                      <span className="text-slate-600">|</span>
                      <span>{heroPriceToday.source || 'snapshot'}</span>
                      <span className="text-slate-600">|</span>
                      <span>{heroPriceToday.market_status || 'delayed'}</span>
                    </div>

                    <p className="text-xs leading-relaxed text-slate-500">
                      {heroPriceToday.quote_note || 'This is the latest live or delayed market quote, not the official open or the final close.'}
                    </p>
                  </div>
                ) : heroError ? (
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <AlertCircle size={28} className="text-slate-600" />
                    <p className="text-sm text-slate-500">Price feed unavailable</p>
                    <p className="text-xs text-slate-600">A delayed or verified close will appear when the feed recovers.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="h-10 animate-pulse rounded-lg bg-slate-700/50" />
                    <div className="grid grid-cols-2 gap-3">
                      <div className="h-16 animate-pulse rounded-xl bg-slate-800/60" />
                      <div className="h-16 animate-pulse rounded-xl bg-slate-800/60" />
                    </div>
                    <div className="h-5 w-2/3 animate-pulse rounded bg-slate-700/50" />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>

        <button
          onClick={() => scrollToHash('#predictor')}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-slate-600 transition-colors hover:text-amber-400"
          aria-label="Scroll to predictor"
        >
          <motion.div animate={{ y: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 2 }}>
            <ChevronDown size={28} />
          </motion.div>
        </button>
      </section>

      <section id="predictor" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-8 text-center"
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">Core Prediction Engine</span>
            <h2 className="mt-2 text-3xl font-bold text-white">
              Tomorrow&apos;s Prediction - <span className="gold-text">AI Forecast</span>
            </h2>
          </motion.div>
          <PricePredictor />
        </div>
      </section>

      <div className="section-divider mx-auto max-w-3xl" />

      <section id="weekly-forecast" className="pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <WeeklyForecast />
        </div>
      </section>

      <div className="section-divider mx-auto max-w-3xl" />

      <section id="accuracy" className="pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AccuracyLog />
        </div>
      </section>

      <section className="pb-20">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <Link
            to="/learn"
            className="group rounded-3xl border border-amber-500/15 bg-gradient-to-br from-amber-500/8 to-slate-900 p-7 transition-colors hover:border-amber-500/30"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10">
              <BookOpen size={20} className="text-amber-300" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Learn</p>
            <h3 className="mt-2 text-2xl font-bold text-white">What really drives gold prices?</h3>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              A deeper guide to gold units, purity, pricing, history, risk, and how to interpret forecasts responsibly.
            </p>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-amber-300">
              Open learning guide <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </span>
          </Link>

          <Link
            to="/dev"
            className="group rounded-3xl border border-slate-800 bg-slate-900/70 p-7 transition-colors hover:border-sky-500/25"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10">
              <Wrench size={20} className="text-sky-300" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">Dev</p>
            <h3 className="mt-2 text-2xl font-bold text-white">Architecture, model pipeline, and developer docs</h3>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              How the project is built, how the model works, how automation runs, and how contributors should reason about the system.
            </p>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-sky-300">
              Open developer page <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        </div>
      </section>

      {!user && (
        <section className="bg-gradient-to-r from-amber-500/5 via-amber-500/10 to-orange-500/5 py-20">
          <div className="mx-auto max-w-4xl px-4 text-center">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <h2 className="mb-4 text-3xl font-bold text-white md:text-4xl">
                Unlock <span className="gold-text">Personalized</span> Gold Intelligence
              </h2>
              <p className="mx-auto mb-8 max-w-2xl text-lg text-slate-400">
                Sign in to get a richer decision engine: allocation range, staged entry guidance, alert reasons, and personalized portfolio context.
              </p>

              <div className="mx-auto mb-10 grid max-w-2xl grid-cols-1 gap-4 text-left sm:grid-cols-3">
                {[
                  { badge: '01', title: 'Decision Engine', desc: 'Action, entry band, allocation, and risk flags' },
                  { badge: '02', title: 'Portfolio Tracker', desc: 'Track holdings against public 24k pricing estimates' },
                  { badge: '03', title: 'Daily Alerts', desc: 'Enable push notifications for fresh forecasts' },
                ].map((feature) => (
                  <div key={feature.title} className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
                    <p className="mb-2 text-2xl text-amber-300">{feature.badge}</p>
                    <p className="mb-1 text-sm font-semibold text-white">{feature.title}</p>
                    <p className="text-xs text-slate-400">{feature.desc}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={handleLogin}
                className="inline-flex items-center gap-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-8 py-4 text-lg font-bold text-white shadow-xl shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500"
              >
                <svg viewBox="0 0 48 48" className="h-5 w-5">
                  <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
                  <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
                  <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
                  <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
                </svg>
                Continue with Google
              </button>
              <p className="mt-4 text-xs text-slate-600">No credit card required | Google authentication only</p>
            </motion.div>
          </div>
        </section>
      )}

      <SiteFooter />
    </div>
  )
}
