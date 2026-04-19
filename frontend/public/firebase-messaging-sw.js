/* global importScripts, firebase */

importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js')

const PUSH_META_CACHE = 'goldsense-push-meta-v1'
const PUSH_META_PATH = '/push-meta/last-received'
let lastPushSignature = null
let lastPushHandledAt = 0

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

function normalizePayload(payload) {
  const data = payload?.data || {}
  const title = payload?.notification?.title || data.title || 'GoldSense Daily Prediction'
  const body = payload?.notification?.body || data.body || 'A fresh gold forecast is available.'
  return {
    title,
    body,
    deep_link: data.deep_link || '/#predictor',
    alert_reason: data.alert_reason || '',
    prediction_date: data.prediction_date || '',
  }
}

function receiptSignature(record) {
  return [record.prediction_date, record.title, record.body].join('|')
}

async function persistPushReceipt(record) {
  const cache = await caches.open(PUSH_META_CACHE)
  await cache.put(
    PUSH_META_PATH,
    new Response(JSON.stringify(record), {
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

async function broadcastPushReceipt(record) {
  const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true })
  await Promise.all(
    allClients.map((client) =>
      client.postMessage({
        type: 'goldsense-push-received',
        payload: record,
      }),
    ),
  )
}

async function showGoldSenseNotification(record) {
  await self.registration.showNotification(record.title, {
    body: record.body,
    tag: `goldsense-daily-prediction-${record.prediction_date || 'latest'}`,
    renotify: true,
    requireInteraction: true,
    data: {
      deep_link: record.deep_link,
      alert_reason: record.alert_reason,
      prediction_date: record.prediction_date,
      received_at: record.receivedAt,
    },
  })
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

async function processIncomingPush(payload, channel) {
  const normalized = normalizePayload(payload)
  const record = {
    ...normalized,
    channel,
    receivedAt: new Date().toISOString(),
  }

  const signature = receiptSignature(record)
  const now = Date.now()
  if (signature === lastPushSignature && now - lastPushHandledAt < 5000) {
    return
  }

  lastPushSignature = signature
  lastPushHandledAt = now

  await persistPushReceipt(record)
  await broadcastPushReceipt(record)
  await showGoldSenseNotification(record)
}

async function initMessaging() {
  try {
    const response = await fetch('/push-config.json', { cache: 'no-store' })
    const config = await response.json()
    if (!config?.apiKey || !config?.messagingSenderId || !config?.appId) return

    firebase.initializeApp(config)
    const messaging = firebase.messaging()

    messaging.onBackgroundMessage((payload) => {
      processIncomingPush(payload, 'background').catch(() => {})
    })
  } catch (_) {
    // Leave silently if config is missing during local development.
  }
}

self.addEventListener('push', (event) => {
  if (!event.data) return

  event.waitUntil(
    (async () => {
      try {
        const payload = event.data.json()
        await processIncomingPush(payload, 'push')
      } catch (_) {
        // Let Firebase/browser default handling continue if the payload is not JSON.
      }
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  const target = event.notification?.data?.deep_link || '/#predictor'
  event.notification.close()
  event.waitUntil(clients.openWindow(target))
})

initMessaging()
