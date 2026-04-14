/* global importScripts, firebase */

importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js')

async function initMessaging() {
  try {
    const response = await fetch('/push-config.json', { cache: 'no-store' })
    const config = await response.json()
    if (!config?.apiKey || !config?.messagingSenderId || !config?.appId) return

    firebase.initializeApp(config)
    const messaging = firebase.messaging()

    messaging.onBackgroundMessage((payload) => {
      const title = payload?.notification?.title || 'GoldSense Daily Prediction'
      const options = {
        body: payload?.notification?.body || 'A fresh gold forecast is available.',
        data: payload?.data || {},
      }
      self.registration.showNotification(title, options)
    })
  } catch (_) {
    // Leave silently if config is missing during local development.
  }
}

self.addEventListener('notificationclick', (event) => {
  const target = event.notification?.data?.deep_link || '/#predictor'
  event.notification.close()
  event.waitUntil(clients.openWindow(target))
})

initMessaging()
