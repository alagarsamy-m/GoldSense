import { motion } from 'framer-motion'
import {
  Bell,
  Cloud,
  Database,
  GitBranch,
  Layers3,
  Rocket,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import Navbar from '../components/Layout/Navbar'
import SiteFooter from '../components/Layout/SiteFooter'

const ARCHITECTURE = [
  {
    icon: <Layers3 size={18} className="text-amber-300" />,
    title: 'Frontend on Vercel',
    body: 'The public site is a Vite React app. Public widgets read snapshot JSON from Vercel first so users see today, tomorrow, weekly, and accuracy data instantly without waiting for the backend to wake.',
  },
  {
    icon: <Cloud size={18} className="text-sky-300" />,
    title: 'Backend and ML on Render',
    body: 'FastAPI serves protected APIs, dashboard data, recommendations, fallback public APIs, and push notification delivery. The model is preloaded on startup and cached in memory, while public snapshot delivery hides most Render cold-start pain.',
  },
  {
    icon: <Database size={18} className="text-emerald-300" />,
    title: 'Supabase for auth and app data',
    body: 'Google authentication, user profiles, chat history, and push subscription tokens live in Supabase. Backend endpoints use the service role for trusted operations while the frontend authenticates users with Supabase JWTs.',
  },
  {
    icon: <GitBranch size={18} className="text-rose-300" />,
    title: 'GitHub Actions for scheduled ops',
    body: 'Daily automation refreshes data, evaluates matured predictions, rebuilds snapshots, optionally sends pushes, and can trigger Render deploys. Weekly automation retrains the model, writes new artifacts, and deploys the updated backend.',
  },
]

const MODEL_NOTES = [
  'GoldSense uses dual-model training: one model estimates the next move direction and one model estimates the move magnitude.',
  'The magnitude model predicts the next-day log return, which is then converted back into a price. This stabilizes the regression task because the model predicts percentage-like movement instead of the full absolute price directly.',
  'The direction classifier gives a confidence score for the next-day move, but public rise/fall/stable messaging is ultimately framed against today\'s live price with a small stable band.',
  'Quantile models generate the lower and upper confidence interval used for range displays.',
]

const FEATURE_NOTES = [
  'Core price features: lagged prices, rolling means, rolling volatility, Bollinger bands, RSI, MACD, and day-of-week calendar patterns.',
  'Macro features: DXY, VIX, 10-year Treasury yield, and crude oil. These help the model react to dollar strength, fear, rate pressure, and inflation proxies.',
  'Sentiment features: the daily sentiment service scores gold-related news and stores it in the dataset. The model then consumes rolling sentiment signals as additional features.',
  'India-facing estimates are derived after the forecast using USD/INR plus customs duty, GST, and benchmark premium assumptions.',
]

const PIPELINE = [
  {
    title: 'train.py',
    body: 'Weekly training pipeline. Builds the dataset, engineers features, trains the direction classifier, trains the magnitude regressor, trains quantile models, evaluates the hold-out window, and writes model artifacts plus metadata.',
  },
  {
    title: 'evaluate.py',
    body: 'Daily evaluation pipeline. Converts pending predictions into realized logs when actual market data is available, computes drift and error insights, writes system status, and creates the next pending batch.',
  },
  {
    title: 'update_data.py',
    body: 'Market dataset refresh. Pulls new gold and USD/INR rows, removes duplicate dates, sorts the CSV files newest-first, fixes change-percent continuity, and rewrites the investing.com-style files safely.',
  },
  {
    title: 'generate_public_snapshots.py',
    body: 'Public snapshot builder. Produces static JSON for today, tomorrow, week, accuracy, and home payloads so the frontend can render instantly from Vercel.',
  },
]

const WORKFLOWS = [
  {
    title: 'daily-evaluate.yml',
    body: 'Runs every day. Refreshes market data, refreshes sentiment, evaluates matured predictions, regenerates public snapshots, sends push notifications, commits updated artifacts, and triggers a backend redeploy.',
  },
  {
    title: 'weekly-retrain.yml',
    body: 'Runs every Monday. Refreshes data, evaluates outstanding rows, retrains the model, regenerates snapshots, commits model artifacts and datasets, uploads the trained artifacts, and triggers a redeploy.',
  },
  {
    title: 'keep-backend-warm.yml',
    body: 'Pings the Render health endpoint on a schedule. This is only a best-effort latency reduction step, not a true guaranteed anti-sleep solution.',
  },
]

const PUSH_STEPS = [
  'Frontend: Firebase web config plus VAPID key live in frontend/public/push-config.json.',
  'Backend/CI: Render and GitHub Actions use FIREBASE_SERVICE_ACCOUNT_JSON in production.',
  'Local development: use FIREBASE_SERVICE_ACCOUNT_PATH in backend/.env instead of pasting multiline raw JSON into the file.',
  'Supabase stores browser tokens in push_subscriptions and the dashboard reads and updates that device list.',
  'backend/send_daily_notifications.py sends the day\'s forecast payload to all enabled tokens after snapshots are refreshed.',
]

export default function Dev() {
  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <Navbar />

      <main>
        <section className="border-b border-amber-500/10 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.14),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.10),transparent_34%)]">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-3xl"
            >
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Developer View</p>
              <h1 className="text-4xl font-black leading-tight sm:text-5xl">
                GoldSense is a snapshot-first forecasting product with daily evaluation and weekly retraining.
              </h1>
              <p className="mt-5 text-lg leading-8 text-slate-300">
                This page is the human developer version of the project story: architecture, model logic, workflow behavior, notification setup, and the current reliability bar.
              </p>
            </motion.div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-6 md:grid-cols-2">
            {ARCHITECTURE.map((item, index) => (
              <motion.article
                key={item.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08 }}
                className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950">
                  {item.icon}
                </div>
                <h2 className="text-xl font-bold">{item.title}</h2>
                <p className="mt-3 text-sm leading-7 text-slate-300">{item.body}</p>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-7">
            <div className="mb-4 flex items-center gap-3">
              <Rocket size={18} className="text-amber-300" />
              <h2 className="text-xl font-bold">Model design</h2>
            </div>
            <div className="space-y-3 text-sm leading-7 text-slate-300">
              {MODEL_NOTES.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-amber-500/15 bg-gradient-to-br from-amber-500/8 to-slate-900 p-7">
            <div className="mb-4 flex items-center gap-3">
              <Wrench size={18} className="text-sky-300" />
              <h2 className="text-xl font-bold">Feature stack</h2>
            </div>
            <div className="space-y-3 text-sm leading-7 text-slate-300">
              {FEATURE_NOTES.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-7">
            <div className="mb-4 flex items-center gap-3">
              <ShieldCheck size={18} className="text-emerald-300" />
              <h2 className="text-xl font-bold">Pipeline scripts</h2>
            </div>
            <div className="space-y-4 text-sm leading-7 text-slate-300">
              {PIPELINE.map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-800/70 bg-slate-950/35 p-4">
                  <p className="font-semibold text-white">{item.title}</p>
                  <p className="mt-2">{item.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-7">
            <div className="mb-4 flex items-center gap-3">
              <GitBranch size={18} className="text-rose-300" />
              <h2 className="text-xl font-bold">GitHub Actions workflows</h2>
            </div>
            <div className="space-y-4 text-sm leading-7 text-slate-300">
              {WORKFLOWS.map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-800/70 bg-slate-950/35 p-4">
                  <p className="font-semibold text-white">{item.title}</p>
                  <p className="mt-2">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-[0.95fr,1.05fr] lg:px-8">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-7">
            <div className="mb-4 flex items-center gap-3">
              <Bell size={18} className="text-amber-300" />
              <h2 className="text-xl font-bold">Push notification setup</h2>
            </div>
            <div className="space-y-3 text-sm leading-7 text-slate-300">
              {PUSH_STEPS.map((step, index) => (
                <p key={step}>
                  <span className="mr-2 font-semibold text-amber-300">{index + 1}.</span>
                  {step}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-amber-500/15 bg-gradient-to-br from-amber-500/8 to-slate-900 p-7">
            <div className="mb-4 flex items-center gap-3">
              <Database size={18} className="text-sky-300" />
              <h2 className="text-xl font-bold">Current reliability bar</h2>
            </div>
            <div className="space-y-3 text-sm leading-7 text-slate-300">
              <p>Public copy should track realized logs, not optimistic backtest marketing.</p>
              <p>Today&apos;s price should always be labeled by source, freshness, and whether the quote is live or delayed.</p>
              <p>Tomorrow&apos;s forecast is an estimated calendar-day close, not a guaranteed official close.</p>
              <p>Weekly retraining is already automated, but the production quality bar depends on clean daily evaluation logs and honest communication of limits.</p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
