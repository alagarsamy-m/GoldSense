import { initializeApp } from 'firebase/app'
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'

let firebaseApp = null
let cachedConfig = null

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
    raw: payload,
  }
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

export async function showForegroundBrowserNotification(payload, registration) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return
  }

  const activeRegistration = registration || await navigator.serviceWorker.ready
  await activeRegistration.showNotification(payload.title, {
    body: payload.body,
    data: {
      deep_link: payload.deepLink,
      alert_reason: payload.alertReason,
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
