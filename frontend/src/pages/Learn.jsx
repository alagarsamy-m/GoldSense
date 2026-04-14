import { motion } from 'framer-motion'
import {
  AlertTriangle,
  BadgeIndianRupee,
  BarChart3,
  BookOpen,
  CalendarRange,
  Globe,
  Landmark,
  Shield,
  Sparkles,
} from 'lucide-react'
import Navbar from '../components/Layout/Navbar'
import SiteFooter from '../components/Layout/SiteFooter'

const BASICS = [
  {
    icon: <BookOpen size={20} className="text-amber-300" />,
    title: 'What is a troy ounce?',
    body: 'Gold is usually quoted in troy ounces in global markets. One troy ounce equals 31.1035 grams, which is why an international USD/oz quote must be converted before it becomes a per-gram India-facing estimate.',
  },
  {
    icon: <Shield size={20} className="text-emerald-300" />,
    title: 'What do 18k, 22k, and 24k mean?',
    body: 'Purity is measured in karats. 24k is close to pure gold, 22k is common for jewellery in India, and 18k contains more alloy metals for durability. Higher purity usually means higher raw gold value, but retail pricing also includes making charges and local premiums.',
  },
  {
    icon: <BadgeIndianRupee size={20} className="text-sky-300" />,
    title: 'Why India retail prices differ from global prices',
    body: 'India-facing rates are influenced by international gold, USD/INR, import duty, GST, local dealer premiums, and demand cycles such as festivals and weddings. That is why a direct USD-to-INR conversion is not the final retail number.',
  },
  {
    icon: <BarChart3 size={20} className="text-rose-300" />,
    title: 'What do Open, High, Low, Close, Vol, and Change mean?',
    body: 'Open is the first traded price of the day. High is the highest traded price. Low is the lowest traded price. Close is the final verified price for the completed session. Vol is the trading volume. Change percent is the day-over-day move.',
  },
]

const DRIVERS = [
  'US dollar strength and weakness',
  'Real interest rates and Treasury yields',
  'Inflation expectations',
  'Geopolitical stress and crisis demand',
  'Central-bank buying and ETF flows',
  'Oil prices and broad commodity inflation',
  'India and China physical demand',
  'Festival, wedding, and seasonal buying pressure',
]

const INVESTMENT_OPTIONS = [
  {
    title: 'Physical gold',
    body: 'Jewellery, coins, and bars are tangible, but they usually include making charges, storage concerns, and purity verification issues. Jewellery is often the least efficient pure-investment route because resale deductions can be material.',
  },
  {
    title: 'Gold ETF',
    body: 'Gold ETFs are market-traded and transparent, which makes them useful for investors who want liquidity and easy price tracking without storing metal physically.',
  },
  {
    title: 'Sovereign Gold Bonds',
    body: 'SGBs are often attractive for long-term Indian investors because they avoid storage issues and historically offered an extra interest component. Liquidity and issuance windows should still be considered.',
  },
  {
    title: 'Digital gold',
    body: 'Digital gold is convenient, but provider quality, fee structure, custody model, and redemption rules matter. It is simple to access, but it is not automatically the safest route just because it is easy.',
  },
]

const HISTORY = [
  'Gold has acted as a reserve asset across wars, inflation regimes, monetary stress, and currency distrust.',
  'It often performs differently from equities and growth assets, which is why many investors use it as a portfolio diversifier rather than a pure return engine.',
  'Gold does not always rise during inflation, but it can respond strongly when inflation, falling real confidence, and macro uncertainty arrive together.',
]

const LIMITATIONS = [
  'A historical dataset alone is not enough for strong real-world forecasting. It captures pattern memory, but it cannot fully see macro shocks, policy surprises, or sudden geopolitical events.',
  'A useful forecast system blends price history with FX, macro indicators, event-sensitive features, and sentiment, then measures real realized error every day.',
  'The honest claim is realized rolling performance, not a fixed 90 to 100 percent guarantee.',
]

export default function Learn() {
  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <Navbar />

      <main>
        <section className="relative overflow-hidden border-b border-amber-500/10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.14),transparent_42%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.10),transparent_38%)]" />
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-3xl"
            >
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Learn Gold Better</p>
              <h1 className="text-4xl font-black leading-tight sm:text-5xl">
                Gold works best when you understand the unit, the driver, and the risk.
              </h1>
              <p className="mt-5 text-lg leading-8 text-slate-300">
                GoldSense is not only a forecast page. It should also help users understand what the numbers mean, what affects gold, and which forms of gold ownership are safer and more practical.
              </p>
            </motion.div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-6 md:grid-cols-2">
            {BASICS.map((topic, index) => (
              <motion.article
                key={topic.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08 }}
                className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950">
                  {topic.icon}
                </div>
                <h2 className="text-xl font-bold">{topic.title}</h2>
                <p className="mt-3 text-sm leading-7 text-slate-300">{topic.body}</p>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-[1.15fr,0.85fr] lg:px-8">
          <div className="rounded-3xl border border-amber-500/15 bg-gradient-to-br from-amber-500/8 to-slate-900 p-7">
            <div className="mb-4 flex items-center gap-3">
              <Globe size={18} className="text-amber-300" />
              <h2 className="text-xl font-bold">What actually moves gold prices</h2>
            </div>
            <div className="grid gap-3 text-sm leading-7 text-slate-300 sm:grid-cols-2">
              {DRIVERS.map((item) => (
                <p key={item} className="rounded-2xl border border-slate-800/70 bg-slate-950/40 px-4 py-3">{item}</p>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-7">
            <div className="mb-4 flex items-center gap-3">
              <CalendarRange size={18} className="text-sky-300" />
              <h2 className="text-xl font-bold">Why weekly forecasts are harder</h2>
            </div>
            <div className="space-y-3 text-sm leading-7 text-slate-300">
              <p>One-day forecasts mainly deal with short-term momentum and mean reversion.</p>
              <p>Seven-day paths accumulate uncertainty quickly because news, rates, FX, and risk sentiment can change at any point during the week.</p>
              <p>That is why weekly forecasts should be shown with measured confidence and daily log validation, not certainty language.</p>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-7">
            <div className="mb-4 flex items-center gap-3">
              <Landmark size={18} className="text-emerald-300" />
              <h2 className="text-xl font-bold">How gold matters historically</h2>
            </div>
            <div className="space-y-3 text-sm leading-7 text-slate-300">
              {HISTORY.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-7">
            <div className="mb-4 flex items-center gap-3">
              <Sparkles size={18} className="text-amber-300" />
              <h2 className="text-xl font-bold">Which form of gold is safer?</h2>
            </div>
            <div className="space-y-4 text-sm leading-7 text-slate-300">
              {INVESTMENT_OPTIONS.map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-4">
                  <p className="font-semibold text-white">{item.title}</p>
                  <p className="mt-2">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-[1.05fr,0.95fr] lg:px-8">
          <div className="rounded-3xl border border-amber-500/15 bg-gradient-to-br from-amber-500/8 to-slate-900 p-7">
            <div className="mb-4 flex items-center gap-3">
              <BarChart3 size={18} className="text-amber-300" />
              <h2 className="text-xl font-bold">How GoldSense estimates India-facing prices</h2>
            </div>
            <div className="space-y-3 text-sm leading-7 text-slate-300">
              <p>GoldSense starts from the international USD/troy ounce quote, converts it with USD/INR, then applies customs duty, GST, and benchmark pricing assumptions to derive 24k and 22k per-gram estimates.</p>
              <p>That makes the India numbers explainable, but they should still be read as benchmark estimates rather than an official jeweller quote in every shop at every moment.</p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-7">
            <div className="mb-4 flex items-center gap-3">
              <Shield size={18} className="text-sky-300" />
              <h2 className="text-xl font-bold">How to use GoldSense well</h2>
            </div>
            <div className="space-y-3 text-sm leading-7 text-slate-300">
              <p>Use today&apos;s price as the current market reference, not as a promise of the final close.</p>
              <p>Use tomorrow&apos;s prediction as a decision aid for the next calendar date, not a guaranteed trading outcome.</p>
              <p>For accumulation, staged buying and entry bands are usually more robust than all-in timing.</p>
              <p>For short-term decisions, watch realized direction performance and daily accuracy logs, not only a single backtest number.</p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-red-500/15 bg-red-500/5 p-7">
            <div className="mb-3 flex items-center gap-3">
              <AlertTriangle size={18} className="text-red-300" />
              <h2 className="text-xl font-bold">Honest limitation</h2>
            </div>
            <div className="space-y-3 text-sm leading-7 text-slate-300">
              {LIMITATIONS.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
