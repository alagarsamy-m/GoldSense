import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  TrendingUp, LogOut, LayoutDashboard, User, Settings,
  Gem, RefreshCw, ChevronRight
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { getDashboard } from '../services/api'
import PricePredictor from '../components/PricePredictor/PricePredictor'
import WeeklyForecast from '../components/WeeklyForecast/WeeklyForecast'
import Recommendations from '../components/Recommendations/Recommendations'
import ProfileWizard from '../components/UserProfile/ProfileWizard'
import Chatbot from '../components/Chatbot/Chatbot'
import toast from 'react-hot-toast'

function PortfolioCard({ profile, prediction }) {
  const holdingsGrams = profile?.gold_holdings_grams || 0
  const price24k = prediction?.tomorrow_price_24k_per_gram || 0
  const portfolioValue = holdingsGrams * price24k

  return (
    <div className="glass-card rounded-2xl p-6 gold-border">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 bg-amber-500/15 rounded-lg flex items-center justify-center">
          <Gem size={18} className="text-amber-400" />
        </div>
        <h3 className="text-lg font-bold text-white">Portfolio Value</h3>
      </div>

      {holdingsGrams > 0 ? (
        <>
          <p className="price-number text-3xl font-black text-amber-400 mb-1">
            ₹{portfolioValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-sm text-slate-400 mb-4">{holdingsGrams}g of gold (24k, Chennai rate)</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/60 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">Holdings</p>
              <p className="price-number text-base font-bold text-white">{holdingsGrams}g</p>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">Stored value</p>
              <p className="price-number text-base font-bold text-white">₹{(profile?.gold_holdings_value_inr || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-4">
          <p className="text-slate-400 text-sm mb-3">No gold holdings recorded yet</p>
          <p className="text-xs text-slate-600">Update your profile to track portfolio value</p>
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const [dashData, setDashData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showProfileWizard, setShowProfileWizard] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    setLoading(true)
    try {
      const data = await getDashboard()
      setDashData(data)
      if (!data.profile?.profile_complete) {
        setShowProfileWizard(true)
      }
    } catch (err) {
      toast.error('Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch {
      toast.error('Sign out failed')
    }
  }

  const handleProfileComplete = (profile) => {
    setShowProfileWizard(false)
    loadDashboard()
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={15} /> },
    { id: 'recommendations', label: 'AI Advice', icon: <TrendingUp size={15} /> },
    { id: 'forecast', label: '7-Day Forecast', icon: <RefreshCw size={15} /> },
    { id: 'profile', label: 'Profile', icon: <User size={15} /> },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Sidebar + Main layout */}
      <div className="flex">
        {/* Sidebar */}
        <div className="hidden lg:flex flex-col w-64 h-screen fixed left-0 top-0 bg-slate-900/80 border-r border-slate-800 p-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 mb-8 p-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center">
              <TrendingUp size={16} className="text-white" />
            </div>
            <span className="text-lg font-bold">
              <span className="gold-text">Gold</span><span className="text-white">Sense</span>
            </span>
          </Link>

          {/* User info */}
          <div className="flex items-center gap-3 p-3 bg-slate-800/60 rounded-xl mb-6">
            <div className="w-9 h-9 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <User size={16} className="text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{dashData?.profile?.full_name || user?.email?.split('@')[0] || 'User'}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Bottom actions */}
          <div className="space-y-2 mt-4">
            <button
              onClick={() => setShowProfileWizard(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-all"
            >
              <Settings size={15} />
              Edit Profile
            </button>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-400 hover:text-red-400 rounded-xl hover:bg-red-500/5 transition-all"
            >
              <LogOut size={15} />
              Sign Out
            </button>
            <Link
              to="/"
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-400 hover:text-amber-400 rounded-xl hover:bg-amber-500/5 transition-all"
            >
              <ChevronRight size={15} />
              Back to Home
            </Link>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 lg:ml-64 min-h-screen">
          {/* Mobile header */}
          <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-slate-900/80 border-b border-slate-800 sticky top-0 z-40">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center">
                <TrendingUp size={13} className="text-white" />
              </div>
              <span className="font-bold text-sm"><span className="gold-text">Gold</span><span className="text-white">Sense</span></span>
            </Link>
            <button onClick={handleSignOut} className="flex items-center gap-1.5 text-xs text-slate-400">
              <LogOut size={14} /> Sign Out
            </button>
          </div>

          {/* Mobile tab bar */}
          <div className="lg:hidden flex border-b border-slate-800 bg-slate-900/50 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-all ${
                  activeTab === tab.id ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-500'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-4 md:p-8">
            {/* Profile wizard overlay */}
            {showProfileWizard && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-50 bg-slate-950/95 flex items-center justify-center p-4 backdrop-blur-sm"
              >
                <div className="w-full max-w-xl">
                  <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-white">Welcome to GoldSense! 🏅</h1>
                    <p className="text-slate-400 mt-2">Let's set up your investment profile for personalized advice</p>
                  </div>
                  <ProfileWizard onComplete={handleProfileComplete} />
                  <button
                    onClick={() => setShowProfileWizard(false)}
                    className="mt-4 w-full text-xs text-slate-600 hover:text-slate-400 transition-colors"
                  >
                    Skip for now (you can complete it later)
                  </button>
                </div>
              </motion.div>
            )}

            {/* Overview tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-white">
                    Good day, {dashData?.profile?.full_name || 'Investor'} 👋
                  </h1>
                  <p className="text-slate-400 text-sm mt-1">Here's your personalized gold market intelligence</p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <PricePredictor />
                  <PortfolioCard profile={dashData?.profile} prediction={dashData?.prediction} />
                </div>
              </div>
            )}

            {/* AI Advice tab */}
            {activeTab === 'recommendations' && (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h2 className="text-xl font-bold text-white">AI Investment Advice</h2>
                  <p className="text-slate-400 text-sm mt-1">Personalized buy/sell recommendations powered by Groq LLM</p>
                </div>
                {dashData?.profile?.profile_complete ? (
                  <Recommendations />
                ) : (
                  <div className="glass-card rounded-2xl p-8 gold-border text-center">
                    <p className="text-slate-300 mb-4">Complete your investment profile to get personalized AI recommendations.</p>
                    <button
                      onClick={() => setShowProfileWizard(true)}
                      className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold rounded-xl text-sm"
                    >
                      Complete Profile
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Forecast tab */}
            {activeTab === 'forecast' && (
              <div className="space-y-6 max-w-3xl">
                <h2 className="text-xl font-bold text-white">7-Day Gold Price Forecast</h2>
                <WeeklyForecast />
              </div>
            )}

            {/* Profile tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6 max-w-xl">
                <h2 className="text-xl font-bold text-white">Investment Profile</h2>
                {dashData?.profile?.profile_complete ? (
                  <div className="glass-card rounded-2xl p-6 gold-border space-y-4">
                    {[
                      { label: 'Name', value: dashData.profile.full_name },
                      { label: 'City', value: dashData.profile.city },
                      { label: 'Gold Holdings', value: `${dashData.profile.gold_holdings_grams || 0}g` },
                      { label: 'Monthly Budget', value: `₹${Number(dashData.profile.monthly_budget_inr || 0).toLocaleString('en-IN')}` },
                      { label: 'Investment Goal', value: dashData.profile.investment_goal?.replace('_', ' ') },
                      { label: 'Risk Appetite', value: dashData.profile.risk_appetite },
                      { label: 'Preferred Forms', value: dashData.profile.preferred_gold_forms?.join(', ') || '—' },
                    ].map(item => (
                      <div key={item.label} className="flex justify-between items-center py-2 border-b border-slate-800/50">
                        <span className="text-sm text-slate-500">{item.label}</span>
                        <span className="text-sm text-white font-medium capitalize">{item.value || '—'}</span>
                      </div>
                    ))}
                    <button
                      onClick={() => setShowProfileWizard(true)}
                      className="w-full mt-2 py-2.5 text-sm font-medium border border-amber-500/30 text-amber-400 rounded-xl hover:bg-amber-500/10 transition-all"
                    >
                      Edit Profile
                    </button>
                  </div>
                ) : (
                  <div className="glass-card rounded-2xl p-8 gold-border text-center">
                    <p className="text-slate-400 mb-4">Your investment profile is not set up yet.</p>
                    <button
                      onClick={() => setShowProfileWizard(true)}
                      className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold rounded-xl text-sm"
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

      {/* Chatbot (only for authenticated users with profile) */}
      {dashData?.profile?.profile_complete && <Chatbot />}
    </div>
  )
}
