import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Gem,
  LayoutDashboard,
  LogOut,
  Settings,
  TrendingUp,
  User,
  Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { getDashboard } from '../services/api'
import { formatInr, formatUsd } from '../utils/marketData'
import PricePredictor from '../components/PricePredictor/PricePredictor'
import WeeklyForecast from '../components/WeeklyForecast/WeeklyForecast'
import Recommendations from '../components/Recommendations/Recommendations'
import NotificationSettings from '../components/Notifications/NotificationSettings'
import ProfileWizard from '../components/UserProfile/ProfileWizard'
import Chatbot from '../components/Chatbot/Chatbot'

function PortfolioCard({ profile, prediction }) {
  const holdingsGrams = profile?.gold_holdings_grams || 0
  const price24k = prediction?.tomorrow_price_24k_per_gram || 0
  const portfolioValue = holdingsGrams * price24k

  return (
    <div className="glass-card rounded-2xl p-6 gold-border">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
          <Gem size={18} className="text-amber-400" />
        </div>
        <h3 className="text-lg font-bold text-white">Portfolio Value</h3>
      </div>

      {holdingsGrams > 0 ? (
        <>
          <p className="price-number mb-1 text-3xl font-black text-amber-400">{formatInr(portfolioValue)}</p>
          <p className="mb-4 text-sm text-slate-400">
            {holdingsGrams}g using the public 24k estimate
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-800/60 p-3">
              <p className="mb-1 text-xs text-slate-500">Holdings</p>
              <p className="price-number text-base font-bold text-white">{holdingsGrams}g</p>
            </div>
            <div className="rounded-xl bg-slate-800/60 p-3">
              <p className="mb-1 text-xs text-slate-500">Stored value</p>
              <p className="price-number text-base font-bold text-white">
                {formatInr(profile?.gold_holdings_value_inr || 0)}
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="py-4 text-center">
          <p className="mb-3 text-sm text-slate-400">No gold holdings recorded yet.</p>
          <p className="text-xs text-slate-600">Update your profile to track portfolio value.</p>
        </div>
      )}
    </div>
  )
}

function OverviewContextCard({ today, prediction, recentAccuracy }) {
  return (
    <div className="glass-card rounded-2xl p-6 gold-border">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800/60">
          <CalendarDays size={18} className="text-slate-200" />
        </div>
        <h3 className="text-lg font-bold text-white">Public Market Snapshot</h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-800/60 p-4">
          <p className="mb-1 text-xs text-slate-500">Today live</p>
          <p className="price-number text-xl font-bold text-white">{formatUsd(today?.live_usd)}</p>
          <p className="mt-2 text-xs text-slate-500">{today?.source || 'snapshot'} | {today?.market_status || 'delayed'}</p>
        </div>
        <div className="rounded-xl bg-slate-800/60 p-4">
          <p className="mb-1 text-xs text-slate-500">Tomorrow signal</p>
          <p className="text-xl font-bold text-amber-300 capitalize">{prediction?.direction_vs_today || 'stable'}</p>
          <p className="mt-2 text-xs text-slate-500">{prediction?.prediction_date || '--'}</p>
        </div>
        <div className="rounded-xl bg-slate-800/60 p-4">
          <p className="mb-1 text-xs text-slate-500">Accuracy rows</p>
          <p className="price-number text-xl font-bold text-white">{recentAccuracy?.length || 0}</p>
          <p className="mt-2 text-xs text-slate-500">Daily refreshed realized log</p>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Today shows the latest live or delayed last-traded price. Tomorrow shows the estimated close for the next calendar date.
      </p>
    </div>
  )
}

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const [dashData, setDashData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showProfileWizard, setShowProfileWizard] = useState(false)
  const [activeTab, setActiveTab] = useState('intelligence')

  const loadDashboard = async () => {
    setLoading(true)
    try {
      const data = await getDashboard()
      setDashData(data)
      if (!data.profile?.profile_complete) {
        setShowProfileWizard(true)
      }
    } catch {
      toast.error('Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch {
      toast.error('Sign out failed')
    }
  }

  const handleProfileComplete = () => {
    setShowProfileWizard(false)
    loadDashboard()
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={15} /> },
    { id: 'intelligence', label: 'Intelligence', icon: <Zap size={15} /> },
    { id: 'tomorrow', label: 'Tomorrow\'s Prediction', icon: <TrendingUp size={15} /> },
    { id: 'forecast', label: 'Weekly Forecast', icon: <CalendarDays size={15} /> },
    { id: 'alerts', label: 'Alerts', icon: <Bell size={15} /> },
    { id: 'profile', label: 'Profile', icon: <User size={15} /> },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="text-slate-400">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="flex">
        <div className="fixed left-0 top-0 hidden h-screen w-64 flex-col border-r border-slate-800 bg-slate-900/80 p-4 lg:flex">
          <Link to="/" className="mb-8 flex items-center gap-2.5 p-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-600">
              <TrendingUp size={16} className="text-white" />
            </div>
            <span className="text-lg font-bold">
              <span className="gold-text">Gold</span>
              <span className="text-white">Sense</span>
            </span>
          </Link>

          <div className="mb-6 flex items-center gap-3 rounded-xl bg-slate-800/60 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/20">
              <User size={16} className="text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">
                {dashData?.profile?.full_name || user?.email?.split('@')[0] || 'User'}
              </p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>

          <nav className="flex-1 space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'border border-amber-500/20 bg-amber-500/10 text-amber-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3">
                  {tab.icon}
                  {tab.label}
                </span>
              </button>
            ))}
          </nav>

          <div className="mt-4 space-y-2">
            <button
              onClick={() => setShowProfileWizard(true)}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition-all hover:bg-slate-800 hover:text-white"
            >
              <Settings size={15} />
              Edit Profile
            </button>
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition-all hover:bg-red-500/5 hover:text-red-400"
            >
              <LogOut size={15} />
              Sign Out
            </button>
            <Link
              to="/"
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition-all hover:bg-amber-500/5 hover:text-amber-400"
            >
              <ChevronRight size={15} />
              Back to Home
            </Link>
          </div>
        </div>

        <div className="min-h-screen flex-1 lg:ml-64">
          <div className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-3 lg:hidden">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-600">
                <TrendingUp size={13} className="text-white" />
              </div>
              <span className="text-sm font-bold">
                <span className="gold-text">Gold</span>
                <span className="text-white">Sense</span>
              </span>
            </Link>
            <button onClick={handleSignOut} className="flex items-center gap-1.5 text-xs text-slate-400">
              <LogOut size={14} />
              Sign Out
            </button>
          </div>

          <div className="flex overflow-x-auto border-b border-slate-800 bg-slate-900/50 lg:hidden">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap border-b-2 px-4 py-3 text-xs font-medium transition-all ${
                  activeTab === tab.id ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-500'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {tab.icon}
                  {tab.label}
                </span>
              </button>
            ))}
          </div>

          <div className="p-4 md:p-8">
            {showProfileWizard && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-4 backdrop-blur-sm"
              >
                <div className="w-full max-w-xl">
                  <div className="mb-6 text-center">
                    <h1 className="text-2xl font-bold text-white">Set up your investor profile</h1>
                    <p className="mt-2 text-slate-400">This is used for personalized recommendations and risk framing.</p>
                  </div>
                  <ProfileWizard onComplete={handleProfileComplete} />
                  <button
                    onClick={() => setShowProfileWizard(false)}
                    className="mt-4 w-full text-xs text-slate-600 transition-colors hover:text-slate-400"
                  >
                    Skip for now
                  </button>
                </div>
              </motion.div>
            )}

            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-white">
                    Welcome back, {dashData?.profile?.full_name || 'Investor'}
                  </h1>
                  <p className="mt-1 text-sm text-slate-400">Quick view of today&apos;s live price, tomorrow&apos;s direction, and your portfolio context.</p>
                </div>
                <div className="grid gap-6 xl:grid-cols-2">
                  <OverviewContextCard
                    today={dashData?.today}
                    prediction={dashData?.prediction}
                    recentAccuracy={dashData?.recent_accuracy}
                  />
                  <PortfolioCard profile={dashData?.profile} prediction={dashData?.prediction} />
                </div>
              </div>
            )}

            {activeTab === 'intelligence' && (
              <div className="max-w-3xl space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white">Personalized Intelligence</h2>
                  <p className="mt-1 text-sm text-slate-400">Clear guidance on what to do now, why, entry range, amount, and risk flags.</p>
                </div>
                {dashData?.profile?.profile_complete ? (
                  <Recommendations />
                ) : (
                  <div className="glass-card rounded-2xl p-8 gold-border text-center">
                    <p className="mb-4 text-slate-300">Complete your investment profile to unlock personalized intelligence.</p>
                    <button
                      onClick={() => setShowProfileWizard(true)}
                      className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-2.5 text-sm font-semibold text-white"
                    >
                      Complete Profile
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'tomorrow' && (
              <div className="max-w-4xl space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white">Tomorrow&apos;s Prediction</h2>
                  <p className="mt-1 text-sm text-slate-400">Estimated close for the next calendar date, compared with today&apos;s live price.</p>
                </div>
                <PricePredictor />
              </div>
            )}

            {activeTab === 'forecast' && (
              <div className="max-w-5xl space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white">Weekly Forecast</h2>
                  <p className="mt-1 text-sm text-slate-400">Monday to Sunday outlook with a larger USD chart and a simpler table.</p>
                </div>
                <WeeklyForecast />
              </div>
            )}

            {activeTab === 'alerts' && (
              <div className="max-w-3xl space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white">Alert Settings</h2>
                  <p className="mt-1 text-sm text-slate-400">Manage your device subscriptions for daily GoldSense pushes.</p>
                </div>
                <NotificationSettings />
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="max-w-xl space-y-6">
                <h2 className="text-xl font-bold text-white">Investment Profile</h2>
                {dashData?.profile?.profile_complete ? (
                  <div className="glass-card space-y-4 rounded-2xl p-6 gold-border">
                    {[
                      { label: 'Name', value: dashData.profile.full_name },
                      { label: 'City', value: dashData.profile.city },
                      { label: 'Gold Holdings', value: `${dashData.profile.gold_holdings_grams || 0}g` },
                      { label: 'Monthly Budget', value: formatInr(dashData.profile.monthly_budget_inr || 0) },
                      { label: 'Investment Goal', value: dashData.profile.investment_goal?.replace('_', ' ') },
                      { label: 'Risk Appetite', value: dashData.profile.risk_appetite },
                      { label: 'Preferred Forms', value: dashData.profile.preferred_gold_forms?.join(', ') || '--' },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between border-b border-slate-800/50 py-2">
                        <span className="text-sm text-slate-500">{item.label}</span>
                        <span className="text-sm font-medium capitalize text-white">{item.value || '--'}</span>
                      </div>
                    ))}
                    <button
                      onClick={() => setShowProfileWizard(true)}
                      className="mt-2 w-full rounded-xl border border-amber-500/30 py-2.5 text-sm font-medium text-amber-400 transition-all hover:bg-amber-500/10"
                    >
                      Edit Profile
                    </button>
                  </div>
                ) : (
                  <div className="glass-card rounded-2xl p-8 gold-border text-center">
                    <p className="mb-4 text-slate-400">Your investment profile is not set up yet.</p>
                    <button
                      onClick={() => setShowProfileWizard(true)}
                      className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-2.5 text-sm font-semibold text-white"
                    >
                      Set Up Profile
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {dashData?.profile?.profile_complete && <Chatbot />}
    </div>
  )
}
