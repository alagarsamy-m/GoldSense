import { motion } from 'framer-motion'
import { Shield, TrendingUp, Sword, Clock, Lock, Globe } from 'lucide-react'

const educationCards = [
  {
    icon: <Shield size={24} className="text-amber-400" />,
    title: "Why is Gold a Trustworthy Investment?",
    content: "Gold has preserved wealth for over 5,000 years. Unlike paper currency, gold cannot be printed or devalued by governments. It acts as a store of value, maintaining purchasing power across centuries. During the 2008 financial crisis, gold surged 25% while stocks crashed 50%.",
    highlight: "5,000+ years of proven value",
    color: "from-amber-500/10 to-yellow-500/5",
    border: "border-amber-500/20",
  },
  {
    icon: <TrendingUp size={24} className="text-blue-400" />,
    title: "What Factors Impact Gold Prices?",
    content: "Gold prices respond to: US Dollar strength (inverse relationship), inflation rates, interest rate decisions by the Federal Reserve, geopolitical tensions, central bank gold purchases, jewellery demand from India & China, and industrial/tech sector demand.",
    highlight: "10+ macroeconomic drivers",
    color: "from-blue-500/10 to-cyan-500/5",
    border: "border-blue-500/20",
  },
  {
    icon: <Sword size={24} className="text-red-400" />,
    title: "Why Do Wars Increase Gold Prices?",
    content: "Wars create economic uncertainty that drives investors toward 'safe haven' assets. During the Russia-Ukraine war (2022), gold jumped from $1,800 to $2,050/oz in weeks. Conflicts disrupt global supply chains, increase inflation, and weaken confidence in fiat currencies — all bullish for gold.",
    highlight: "Gold = safe haven in crisis",
    color: "from-red-500/10 to-orange-500/5",
    border: "border-red-500/20",
  },
  {
    icon: <Clock size={24} className="text-purple-400" />,
    title: "20th Century Gold Price Fluctuations",
    content: "Gold was pegged at $35/oz under Bretton Woods until 1971, when Nixon ended gold convertibility. This triggered massive volatility: $35 → $850/oz by 1980, then back to $250 by 1999, then $1,900 in 2011, and now $5,000+ in 2026. Each spike reflects global economic turbulence.",
    highlight: "$35 to $5,000+ in 55 years",
    color: "from-purple-500/10 to-violet-500/5",
    border: "border-purple-500/20",
  },
  {
    icon: <Lock size={24} className="text-green-400" />,
    title: "Is Gold Safe for Investing?",
    content: "Gold is one of the safest long-term assets, but it doesn't generate regular income like stocks or bonds. Financial experts recommend 5–15% portfolio allocation in gold. In India, Sovereign Gold Bonds (SGBs) offer 2.5% annual interest + price appreciation, making them the most tax-efficient gold investment.",
    highlight: "Recommended: 5–15% of portfolio",
    color: "from-green-500/10 to-emerald-500/5",
    border: "border-green-500/20",
  },
  {
    icon: <Globe size={24} className="text-cyan-400" />,
    title: "Global Gold Market Insights",
    content: "The world produces ~3,300 tonnes of gold annually. India and China together consume 50% of global jewellery demand. Central banks added record 1,136 tonnes to reserves in 2022. ETFs hold 3,000+ tonnes. The total above-ground gold ever mined would fill just 3.5 Olympic swimming pools.",
    highlight: "India = world's #2 gold consumer",
    color: "from-cyan-500/10 to-sky-500/5",
    border: "border-cyan-500/20",
  },
]

const inspiringQuotes = [
  { quote: "Gold is the money of kings, silver is the money of gentlemen, barter is the money of peasants.", author: "Norm Franz" },
  { quote: "In gold we trust. Not in systems. Not in governments. In gold.", author: "Anonymous Investor" },
  { quote: "Gold is a constant. It's like the North Star.", author: "Steve Forbes" },
]

export default function EducationSection() {
  return (
    <section id="education" className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <span className="text-xs font-semibold text-amber-400 uppercase tracking-widest">Gold Intelligence</span>
          <h2 className="text-3xl md:text-4xl font-bold text-white mt-2 mb-4">
            Understand Gold Before You <span className="gold-text">Invest</span>
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            Knowledge is the foundation of smart investing. Learn what moves gold prices,
            why it has endured as the ultimate store of value, and how to invest wisely.
          </p>
        </motion.div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {educationCards.map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`bg-gradient-to-br ${card.color} border ${card.border} rounded-2xl p-6 hover:scale-[1.02] transition-transform cursor-default`}
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-slate-800/80 rounded-xl flex items-center justify-center flex-shrink-0">
                  {card.icon}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-2 leading-snug">{card.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{card.content}</p>
                  <p className="mt-3 text-xs font-semibold text-amber-400/80 bg-amber-500/10 px-2.5 py-1 rounded-full inline-block">
                    {card.highlight}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Inspiring quotes */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="bg-gradient-to-r from-amber-500/5 via-amber-500/10 to-amber-500/5 border border-amber-500/15 rounded-2xl p-8"
        >
          <h3 className="text-center text-sm font-semibold text-amber-400 uppercase tracking-widest mb-8">
            Words of Wisdom
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {inspiringQuotes.map((q, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="text-center"
              >
                <p className="text-slate-300 text-sm italic leading-relaxed mb-3">"{q.quote}"</p>
                <p className="text-xs text-amber-500">— {q.author}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
