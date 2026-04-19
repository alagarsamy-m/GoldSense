import { initializeApp } from 'firebase/app'
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'

let firebaseApp = null
let cachedConfig = null
const LAST_PUSH_RECEIPT_STORAGE_KEY = 'goldsense-last-push-received'
const LAST_PUSH_RECEIPT_CACHE = 'goldsense-push-meta-v1'
const LAST_PUSH_RECEIPT_PATH = '/push-meta/last-received'

async function loadPushConfig() {
  if (cachedConfig) return cachedConfig
  const response = await fetch('/push-config.json', { cache: 'no-store' })
  if (!response.ok) throw new Error('Push config unavailable')
  cachedConfig = await response.json()
  return cachedConfig
}

async function getFirebaseApp() {
  const config = await loadPushConfig()
  if (!config?.apiKey || !config?.messagingSenderId || !config?.appId) {
    throw new Error('Push config is incomplete')
  }
  if (!firebaseApp) {
    firebaseApp = initializeApp(config, 'goldsense-web-push')
  }
  return { app: firebaseApp, config }
}

async function resolveWebPushToken({ requestPermission = false } = {}) {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    throw new Error('Web push is not supported in this browser')
  }

  const supported = await isSupported()
  if (!supported) {
    throw new Error('Firebase web messaging is not supported in this browser')
  }

  let permission = Notification.permission
  if (requestPermission && permission !== 'granted') {
    permission = await Notification.requestPermission()
  }
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted')
  }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
  const { app, config } = await getFirebaseApp()
  const messaging = getMessaging(app)
  const token = await getToken(messaging, {
    vapidKey: config.vapidKey,
    serviceWorkerRegistration: registration,
  })

  if (!token) {
    throw new Error('No push token was returned')
  }
  return token
}

function normalizeForegroundPayload(payload) {
  return {
    title: payload?.notification?.title || 'GoldSense Daily Prediction',
    body: payload?.notification?.body || 'A fresh gold forecast is available.',
    deepLink: payload?.data?.deep_link || '/#predictor',
    alertReason: payload?.data?.alert_reason || '',
    predictionDate: payload?.data?.prediction_date || '',
    raw: payload,
  }
}

function persistReceiptToLocalStorage(receipt) {
  if (typeof window === 'undefined' || !window.localStorage) return
  window.localStorage.setItem(LAST_PUSH_RECEIPT_STORAGE_KEY, JSON.stringify(receipt))
}

async function persistReceiptToCache(receipt) {
  if (typeof window === 'undefined' || !('caches' in window)) return
  const cache = await window.caches.open(LAST_PUSH_RECEIPT_CACHE)
  await cache.put(
    LAST_PUSH_RECEIPT_PATH,
    new Response(JSON.stringify(receipt), {
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

export async function recordPushReceipt(receipt) {
  const normalized = {
    receivedAt: new Date().toISOString(),
    channel: 'foreground',
    title: receipt?.title || 'GoldSense Daily Prediction',
    body: receipt?.body || 'A fresh gold forecast is available.',
    deepLink: receipt?.deepLink || '/#predictor',
    alertReason: receipt?.alertReason || '',
    predictionDate: receipt?.predictionDate || '',
  }

  persistReceiptToLocalStorage(normalized)
  await persistReceiptToCache(normalized)
  return normalized
}

export async function getLastPushReceipt() {
  if (typeof window !== 'undefined' && window.localStorage) {
    const raw = window.localStorage.getItem(LAST_PUSH_RECEIPT_STORAGE_KEY)
    if (raw) {
      try {
        return JSON.parse(raw)
      } catch {
        window.localStorage.removeItem(LAST_PUSH_RECEIPT_STORAGE_KEY)
      }
    }
  }

  if (typeof window !== 'undefined' && 'caches' in window) {
    const cache = await window.caches.open(LAST_PUSH_RECEIPT_CACHE)
    const response = await cache.match(LAST_PUSH_RECEIPT_PATH)
    if (response) {
      try {
        const receipt = await response.json()
        persistReceiptToLocalStorage(receipt)
        return receipt
      } catch {
        return null
      }
    }
  }

  return null
}

export async function subscribeToForegroundMessages(handler) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return () => {}
  }

  const supported = await isSupported()
  if (!supported) {
    return () => {}
  }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
  const { app } = await getFirebaseApp()
  const messaging = getMessaging(app)

  return onMessage(messaging, (payload) => {
    handler(normalizeForegroundPayload(payload), registration)
  })
}

export function subscribeToServiceWorkerPushMessages(handler) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {}
  }

  const listener = (event) => {
    if (event.data?.type !== 'goldsense-push-received' || !event.data?.payload) {
      return
    }
    handler(event.data.payload)
  }

  navigator.serviceWorker.addEventListener('message', listener)
  return () => navigator.serviceWorker.removeEventListener('message', listener)
}

export async function showForegroundBrowserNotification(payload, registration) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return
  }

  const activeRegistration = registration || await navigator.serviceWorker.ready
  await activeRegistration.showNotification(payload.title, {
    body: payload.body,
    tag: 'goldsense-daily-prediction',
    requireInteraction: true,
    data: {
      deep_link: payload.deepLink,
      alert_reason: payload.alertReason,
      prediction_date: payload.predictionDate,
    },
  })
}

export async function requestWebPushToken() {
  return resolveWebPushToken({ requestPermission: true })
}

export async function getExistingWebPushToken() {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return null
  }

  try {
    return await resolveWebPushToken({ requestPermission: false })
  } catch {
    return null
  }
}
