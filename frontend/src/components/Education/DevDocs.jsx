import { motion } from 'framer-motion'
import { Code2, Github, ExternalLink, Cpu, Database, Globe, Zap } from 'lucide-react'

const techStack = [
  { name: 'React 18 + Vite', category: 'Frontend', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  { name: 'Tailwind CSS v4', category: 'Styling', color: 'text-sky-400', bg: 'bg-sky-500/10' },
  { name: 'FastAPI', category: 'Backend', color: 'text-green-400', bg: 'bg-green-500/10' },
  { name: 'XGBoost', category: 'ML Model', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  { name: 'Groq LLM (Llama 3.3)', category: 'AI', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { name: 'Supabase + Google OAuth', category: 'Auth & DB', color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { name: 'Google Cloud Run', category: 'Hosting', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { name: 'Vercel', category: 'Frontend CDN', color: 'text-white', bg: 'bg-slate-700/50' },
  { name: 'GitHub Actions', category: 'CI/CD', color: 'text-pink-400', bg: 'bg-pink-500/10' },
  { name: 'yfinance', category: 'Data Source', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
]

const usefulLinks = [
  { name: 'MCX India (Live Gold)', url: 'https://www.mcxindia.com', icon: '🏅' },
  { name: 'NSE Gold ETF', url: 'https://www.nseindia.com', icon: '📈' },
  { name: 'World Gold Council', url: 'https://www.gold.org', icon: '🌍' },
  { name: 'Kitco Gold Charts', url: 'https://www.kitco.com', icon: '📊' },
  { name: 'MMTC-PAMP India', url: 'https://www.mmtcpamp.com', icon: '🪙' },
  { name: 'RBI Gold Bond Scheme', url: 'https://rbi.org.in', icon: '🏦' },
  { name: 'GoldPrice.org', url: 'https://goldprice.org', icon: '💰' },
  { name: 'Investing.com Gold', url: 'https://www.investing.com/commodities/gold', icon: '📉' },
]

export default function DevDocs() {
  return (
    <section id="devdocs" className="py-20 border-t border-slate-800/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <span className="text-xs font-semibold text-amber-400 uppercase tracking-widest">Developer Docs</span>
          <h2 className="text-3xl font-bold text-white mt-2 mb-4">
            Built with <span className="gold-text">Precision</span>
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            GoldSense is an open, extensible AI system. Here's how it's built.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Architecture */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="glass-card rounded-2xl p-6 gold-border"
          >
            <div className="flex items-center gap-3 mb-5">
              <Cpu size={20} className="text-amber-400" />
              <h3 className="text-lg font-bold text-white">System Architecture</h3>
            </div>
            <div className="space-y-3 text-sm">
              {[
                { step: '01', title: 'Data Pipeline', desc: 'Historical data (2000–2026) + weekly yfinance updates via GitHub Actions' },
                { step: '02', title: 'ML Model', desc: 'XGBoost trained on 30+ features: lag prices, RSI, MACD, Bollinger Bands, USD/INR' },
                { step: '03', title: 'Prediction API', desc: 'FastAPI on Google Cloud Run — tomorrow + 7-day forecast + India conversions' },
                { step: '04', title: 'Personalization', desc: 'Groq LLM (Llama 3.3 70B) generates tailored recommendations & chatbot responses' },
                { step: '05', title: 'CI/CD', desc: 'Every Monday: fetch data → evaluate accuracy → retrain model → deploy' },
              ].map(item => (
                <div key={item.step} className="flex gap-3">
                  <span className="text-amber-500 font-mono text-xs mt-0.5 font-bold">{item.step}</span>
                  <div>
                    <span className="text-white font-medium">{item.title}</span>
                    <span className="text-slate-400"> — {item.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Tech stack */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="glass-card rounded-2xl p-6 gold-border"
          >
            <div className="flex items-center gap-3 mb-5">
              <Code2 size={20} className="text-amber-400" />
              <h3 className="text-lg font-bold text-white">Tech Stack</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {techStack.map(tech => (
                <div key={tech.name} className={`${tech.bg} rounded-lg px-3 py-2`}>
                  <p className={`text-xs font-semibold ${tech.color}`}>{tech.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{tech.category}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Useful links */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="glass-card rounded-2xl p-6 gold-border mb-8"
        >
          <div className="flex items-center gap-3 mb-5">
            <Globe size={20} className="text-amber-400" />
            <h3 className="text-lg font-bold text-white">Useful Gold Resources</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {usefulLinks.map(link => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 hover:border-amber-500/30 rounded-xl px-3 py-2.5 transition-all group"
              >
                <span className="text-lg">{link.icon}</span>
                <span className="text-xs text-slate-300 group-hover:text-amber-400 transition-colors leading-tight">
                  {link.name}
                </span>
                <ExternalLink size={10} className="text-slate-600 ml-auto group-hover:text-amber-500 flex-shrink-0" />
              </a>
            ))}
          </div>
        </motion.div>

        {/* GitHub link */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <a
            href="https://github.com/YOUR_USERNAME/goldsense-project"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-amber-500/30 rounded-xl transition-all text-white font-medium"
          >
            <Github size={18} />
            View Source on GitHub
            <ExternalLink size={14} className="text-slate-500" />
          </a>
          <p className="mt-3 text-xs text-slate-600">Open source • MIT License • Star us on GitHub ⭐</p>
        </motion.div>
      </div>
    </section>
  )
}
