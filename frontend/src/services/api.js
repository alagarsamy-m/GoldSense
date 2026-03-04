import axios from 'axios'
import { supabase } from './supabase'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// Add Supabase auth token to protected requests
api.interceptors.request.use(async (config) => {
  if (config.requiresAuth) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`
    }
  }
  return config
})

// ── Public endpoints ──────────────────────────────────────────────────────────

export const getPredictionTomorrow = () =>
  api.get('/api/prediction/tomorrow').then(r => r.data)

export const getWeekForecast = () =>
  api.get('/api/prediction/week').then(r => r.data)

export const getAccuracyLogs = (limit = 30) =>
  api.get(`/api/prediction/accuracy?limit=${limit}`).then(r => r.data)

export const getModelInfo = () =>
  api.get('/api/prediction/model-info').then(r => r.data)

// ── Protected endpoints (require auth) ───────────────────────────────────────

export const getUserProfile = () =>
  api.get('/api/user/profile', { requiresAuth: true }).then(r => r.data)

export const updateUserProfile = (data) =>
  api.put('/api/user/profile', data, { requiresAuth: true }).then(r => r.data)

export const getRecommendations = () =>
  api.get('/api/user/recommendations', { requiresAuth: true }).then(r => r.data)

export const getDashboard = () =>
  api.get('/api/user/dashboard', { requiresAuth: true }).then(r => r.data)

export const sendChatMessage = (messages, includeHistory = true) =>
  api.post('/api/chatbot/message', { messages, include_history: includeHistory }, { requiresAuth: true })
    .then(r => r.data)

export const getChatHistory = (limit = 20) =>
  api.get(`/api/chatbot/history?limit=${limit}`, { requiresAuth: true }).then(r => r.data)

export const clearChatHistory = () =>
  api.delete('/api/chatbot/history', { requiresAuth: true }).then(r => r.data)

export default api
