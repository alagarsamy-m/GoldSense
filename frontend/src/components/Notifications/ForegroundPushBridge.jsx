import { useEffect } from 'react'
import { BellRing } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import {
  recordPushReceipt,
  showForegroundBrowserNotification,
  subscribeToForegroundMessages,
  subscribeToServiceWorkerPushMessages,
} from '../../services/notifications'

function openDeepLink(target, navigate) {
  if (!target) return

  if (target.startsWith('http://') || target.startsWith('https://')) {
    window.location.href = target
    return
  }

  if (target.startsWith('/#') || target.startsWith('#')) {
    window.location.assign(target.startsWith('#') ? `/${target}` : target)
    return
  }

  navigate(target)
}

function NotificationToast({ title, body, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full max-w-md items-start gap-3 rounded-2xl border border-amber-500/20 bg-slate-900/95 p-4 text-left shadow-2xl shadow-black/30 transition hover:border-amber-400/40"
    >
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
        <BellRing size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-300">{body}</p>
        <p className="mt-2 text-xs font-medium text-amber-300">Open forecast</p>
      </div>
    </button>
  )
}

function emitReceipt(receipt) {
  window.dispatchEvent(
    new CustomEvent('goldsense:push-received', {
      detail: receipt,
    }),
  )
}

export default function ForegroundPushBridge() {
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    let cleanup = () => {}
    let backgroundCleanup = () => {}

    subscribeToForegroundMessages(async (payload, registration) => {
      const receipt = await recordPushReceipt({
        ...payload,
        channel: 'foreground',
      })
      emitReceipt(receipt)

      try {
        await showForegroundBrowserNotification(payload, registration)
      } catch (_) {
        // Keep the in-app toast path working even if native foreground notifications fail.
      }

      toast.custom(
        () => (
          <NotificationToast
            title={payload.title}
            body={payload.body}
            onOpen={() => openDeepLink(payload.deepLink, navigate)}
          />
        ),
        {
          duration: 12000,
          position: 'top-right',
        },
      )
    })
      .then((unsubscribe) => {
        if (!active) {
          unsubscribe()
          return
        }
        cleanup = unsubscribe
      })
      .catch(() => {})

    backgroundCleanup = subscribeToServiceWorkerPushMessages((receipt) => {
      recordPushReceipt(receipt)
        .then((savedReceipt) => {
          emitReceipt(savedReceipt)

          if (document.hidden) {
            return
          }

          toast.custom(
            () => (
              <NotificationToast
                title={savedReceipt.title}
                body={savedReceipt.body}
                onOpen={() => openDeepLink(savedReceipt.deepLink, navigate)}
              />
            ),
            {
              duration: 12000,
              position: 'top-right',
            },
          )
        })
        .catch(() => {})
    })

    return () => {
      active = false
      cleanup()
      backgroundCleanup()
    }
  }, [navigate])

  return null
}
