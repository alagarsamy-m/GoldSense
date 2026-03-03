import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X, Send, Trash2, Bot, User, Loader2 } from 'lucide-react'
import { sendChatMessage, clearChatHistory } from '../../services/api'
import toast from 'react-hot-toast'

function Message({ role, content }) {
  return (
    <div className={`flex gap-3 ${role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
        role === 'user' ? 'bg-amber-500' : 'bg-slate-700'
      }`}>
        {role === 'user' ? <User size={14} className="text-black" /> : <Bot size={14} className="text-amber-400" />}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
        role === 'user'
          ? 'chat-user text-white rounded-tr-sm'
          : 'chat-assistant text-slate-200 rounded-tl-sm'
      }`}>
        {content}
      </div>
    </div>
  )
}

const STARTER_PROMPTS = [
  "Should I buy gold this week?",
  "What's the outlook for gold prices?",
  "How do I invest in Sovereign Gold Bonds?",
  "Is now a good time to sell my gold?",
]

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: "Hello! I'm GoldSense AI, your personal gold investment advisor. I can help you understand gold price trends, investment strategies, and give personalized advice based on your profile. What would you like to know? 🏅"
      }])
    }
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = async (text) => {
    const messageText = text || input.trim()
    if (!messageText || loading) return

    setInput('')
    const userMessage = { role: 'user', content: messageText }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setLoading(true)

    try {
      const response = await sendChatMessage(
        updatedMessages.map(m => ({ role: m.role, content: m.content })),
        false
      )
      setMessages(prev => [...prev, { role: 'assistant', content: response.response }])
    } catch (err) {
      toast.error('Failed to get response. Please try again.')
      setMessages(prev => prev.slice(0, -1)) // Remove the user message on failure
    } finally {
      setLoading(false)
    }
  }

  const handleClear = async () => {
    try {
      await clearChatHistory()
      setMessages([{
        role: 'assistant',
        content: "Chat history cleared. How can I help you with your gold investments today?"
      }])
    } catch {
      setMessages([{
        role: 'assistant',
        content: "How can I help you today?"
      }])
    }
  }

  return (
    <>
      {/* Floating button */}
      <motion.button
        onClick={() => setIsOpen(true)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full shadow-2xl shadow-amber-500/30 flex items-center justify-center"
        style={{ display: isOpen ? 'none' : 'flex' }}
      >
        <MessageCircle size={24} className="text-white" />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-slate-950 animate-pulse" />
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-32px)] h-[560px] max-h-[calc(100vh-100px)] flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-amber-500/20 bg-slate-950"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-500/20 to-orange-500/10 border-b border-amber-500/20">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center">
                  <Bot size={16} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">GoldSense AI</p>
                  <p className="text-xs text-green-400">● Online</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleClear}
                  className="p-1.5 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-slate-800 transition-all"
                  title="Clear history"
                >
                  <Trash2 size={14} />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-slate-800 transition-all"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, i) => (
                <Message key={i} role={msg.role} content={msg.content} />
              ))}
              {loading && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <Bot size={14} className="text-amber-400" />
                  </div>
                  <div className="chat-assistant rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1 items-center">
                      <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Starter prompts (show only when 1 message) */}
            {messages.length === 1 && (
              <div className="px-4 pb-2 grid grid-cols-2 gap-1.5">
                {STARTER_PROMPTS.map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="text-left text-xs text-slate-400 hover:text-amber-400 bg-slate-800/60 hover:bg-amber-500/10 border border-slate-700/50 hover:border-amber-500/30 rounded-lg px-2.5 py-2 transition-all leading-tight"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="p-3 border-t border-slate-800">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Ask about gold investments..."
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                  disabled={loading}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading}
                  className="w-10 h-10 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 rounded-xl flex items-center justify-center transition-all"
                >
                  {loading ? <Loader2 size={16} className="text-black animate-spin" /> : <Send size={16} className="text-black" />}
                </button>
              </div>
              <p className="text-xs text-slate-600 mt-1.5 text-center">Powered by Groq Llama 3.3 • Not financial advice</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
