import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, ChevronLeft, Check, User, Target, DollarSign, Gem } from 'lucide-react'
import { updateUserProfile } from '../../services/api'
import toast from 'react-hot-toast'

const GOLD_FORMS = [
  { value: 'Jewellery', label: '💍 Jewellery' },
  { value: 'Coins', label: '🪙 Gold Coins' },
  { value: 'Gold ETF', label: '📊 Gold ETF' },
  { value: 'Digital Gold', label: '📱 Digital Gold' },
  { value: 'Sovereign Gold Bond', label: '🏦 Sovereign Gold Bond' },
]

const steps = [
  {
    id: 1,
    title: "Tell us about yourself",
    icon: <User size={20} />,
    fields: ['name', 'city'],
  },
  {
    id: 2,
    title: "Your gold holdings",
    icon: <Gem size={20} />,
    fields: ['holdings'],
  },
  {
    id: 3,
    title: "Investment preferences",
    icon: <Target size={20} />,
    fields: ['goal', 'risk', 'forms'],
  },
  {
    id: 4,
    title: "Budget & targets",
    icon: <DollarSign size={20} />,
    fields: ['budget'],
  },
]

export default function ProfileWizard({ onComplete }) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    full_name: '',
    city: 'Chennai',
    gold_holdings_grams: '',
    gold_holdings_value_inr: '',
    monthly_budget_inr: '',
    investment_goal: '',
    risk_appetite: '',
    preferred_gold_forms: [],
    target_savings_inr: '',
  })

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))
  const toggleForm = (form_type) => {
    setForm(prev => ({
      ...prev,
      preferred_gold_forms: prev.preferred_gold_forms.includes(form_type)
        ? prev.preferred_gold_forms.filter(f => f !== form_type)
        : [...prev.preferred_gold_forms, form_type],
    }))
  }

  const handleNext = () => setStep(s => s + 1)
  const handleBack = () => setStep(s => s - 1)

  const handleSubmit = async () => {
    setSaving(true)
    try {
      const payload = {
        full_name: form.full_name,
        city: form.city,
        gold_holdings_grams: form.gold_holdings_grams ? parseFloat(form.gold_holdings_grams) : null,
        gold_holdings_value_inr: form.gold_holdings_value_inr ? parseFloat(form.gold_holdings_value_inr) : null,
        monthly_budget_inr: form.monthly_budget_inr ? parseFloat(form.monthly_budget_inr) : null,
        investment_goal: form.investment_goal || null,
        risk_appetite: form.risk_appetite || null,
        preferred_gold_forms: form.preferred_gold_forms,
        target_savings_inr: form.target_savings_inr ? parseFloat(form.target_savings_inr) : null,
        profile_complete: true,
      }
      await updateUserProfile(payload)
      toast.success('Profile saved! Welcome to GoldSense.')
      onComplete?.(payload)
    } catch {
      toast.error('Failed to save profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = "w-full bg-slate-800/80 border border-slate-700 focus:border-amber-500/50 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none transition-colors text-sm"
  const labelClass = "block text-xs text-slate-400 font-medium mb-1.5 uppercase tracking-wider"

  return (
    <div className="glass-card rounded-2xl p-6 md:p-8 gold-border max-w-xl mx-auto">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((s, i) => (
          <div key={s.id} className={`flex items-center gap-2 ${i < steps.length - 1 ? 'flex-1' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
              i < step ? 'bg-amber-500 text-black' :
              i === step ? 'bg-amber-500/20 border-2 border-amber-500 text-amber-400' :
              'bg-slate-800 text-slate-500'
            }`}>
              {i < step ? <Check size={14} /> : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 rounded-full transition-all ${i < step ? 'bg-amber-500' : 'bg-slate-800'}`} />
            )}
          </div>
        ))}
      </div>

      <h2 className="text-xl font-bold text-white mb-1">Set Up Your Investment Profile</h2>
      <p className="text-sm text-slate-400 mb-6">Step {step + 1} of {steps.length}: {steps[step].title}</p>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
        >
          {/* Step 1: Personal info */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Your Name</label>
                <input type="text" className={inputClass} placeholder="e.g. Alagarsamy" value={form.full_name} onChange={e => set('full_name', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>City</label>
                <input type="text" className={inputClass} placeholder="e.g. Chennai" value={form.city} onChange={e => set('city', e.target.value)} />
              </div>
            </div>
          )}

          {/* Step 2: Holdings */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Current Gold Holdings (grams)</label>
                <input type="number" className={inputClass} placeholder="e.g. 50" value={form.gold_holdings_grams} onChange={e => set('gold_holdings_grams', e.target.value)} />
                <p className="text-xs text-slate-600 mt-1">Enter 0 if you don't have any gold yet</p>
              </div>
              <div>
                <label className={labelClass}>Approx. Current Value (₹)</label>
                <input type="number" className={inputClass} placeholder="e.g. 900000" value={form.gold_holdings_value_inr} onChange={e => set('gold_holdings_value_inr', e.target.value)} />
              </div>
            </div>
          )}

          {/* Step 3: Preferences */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <label className={labelClass}>Investment Goal</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'short_term', label: 'Short Term', desc: '< 2 years' },
                    { value: 'long_term', label: 'Long Term', desc: '> 5 years' },
                    { value: 'both', label: 'Both', desc: 'Mixed' },
                  ].map(opt => (
                    <button key={opt.value} onClick={() => set('investment_goal', opt.value)}
                      className={`p-3 rounded-xl border text-center transition-all ${form.investment_goal === opt.value ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-slate-700 text-slate-400 hover:border-amber-500/30'}`}>
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs opacity-70">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>Risk Appetite</label>
                <div className="grid grid-cols-3 gap-2">
                  {['conservative', 'moderate', 'aggressive'].map(r => (
                    <button key={r} onClick={() => set('risk_appetite', r)}
                      className={`p-3 rounded-xl border capitalize text-sm font-medium transition-all ${form.risk_appetite === r ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-slate-700 text-slate-400 hover:border-amber-500/30'}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>Preferred Gold Forms (select all that apply)</label>
                <div className="grid grid-cols-2 gap-2">
                  {GOLD_FORMS.map(gf => (
                    <button key={gf.value} onClick={() => toggleForm(gf.value)}
                      className={`p-2.5 rounded-xl border text-left text-sm transition-all ${form.preferred_gold_forms.includes(gf.value) ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-slate-700 text-slate-400 hover:border-amber-500/30'}`}>
                      {gf.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Budget */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Monthly Investment Budget (₹)</label>
                <input type="number" className={inputClass} placeholder="e.g. 10000" value={form.monthly_budget_inr} onChange={e => set('monthly_budget_inr', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Target Savings Goal (₹) — Optional</label>
                <input type="number" className={inputClass} placeholder="e.g. 5000000" value={form.target_savings_inr} onChange={e => set('target_savings_inr', e.target.value)} />
                <p className="text-xs text-slate-600 mt-1">e.g. ₹50 lakh for a house purchase fund</p>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex gap-3 mt-8">
        {step > 0 && (
          <button onClick={handleBack} className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-xl transition-all">
            <ChevronLeft size={16} /> Back
          </button>
        )}
        {step < steps.length - 1 ? (
          <button onClick={handleNext} className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl hover:from-amber-400 hover:to-orange-500 transition-all">
            Next <ChevronRight size={16} />
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl hover:from-amber-400 hover:to-orange-500 disabled:opacity-50 transition-all">
            {saving ? 'Saving...' : <><Check size={16} /> Complete Setup</>}
          </button>
        )}
      </div>
    </div>
  )
}
