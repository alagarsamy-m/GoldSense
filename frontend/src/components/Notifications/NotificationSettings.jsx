import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Bell, BellOff, CheckCircle2, RefreshCw, Smartphone } from 'lucide-react'
import {
  disableNotificationSubscription,
  getNotificationSettings,
  upsertNotificationSubscription,
} from '../../services/api'
import { getExistingWebPushToken, requestWebPushToken } from '../../services/notifications'

function browserLabel() {
  const userAgent = navigator.userAgent || ''
  if (userAgent.includes('Edg')) return 'Edge'
  if (userAgent.includes('Chrome')) return 'Chrome'
  if (userAgent.includes('Safari')) return 'Safari'
  if (userAgent.includes('Firefox')) return 'Firefox'
  return 'Browser'
}

function deviceLabel() {
  return `${browserLabel()} on ${navigator.platform || 'web'}`
}

export default function NotificationSettings() {
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [currentToken, setCurrentToken] = useState(null)

  const loadSubscriptions = async () => {
    setLoading(true)
    try {
      const [result, existingToken] = await Promise.all([
        getNotificationSettings(),
        getExistingWebPushToken(),
      ])
      setSubscriptions(result.subscriptions || [])
      setCurrentToken(existingToken)
    } catch {
      toast.error('Unable to load notification settings.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSubscriptions()
  }, [])

  const enabledSubscriptions = useMemo(
    () => subscriptions.filter((item) => item.enabled),
    [subscriptions],
  )

  const currentDeviceSubscription = useMemo(
    () => enabledSubscriptions.find((item) => item.fcm_token === currentToken) || null,
    [enabledSubscriptions, currentToken],
  )

  const enableNotifications = async () => {
    setSaving(true)
    try {
      const token = await requestWebPushToken()
      setCurrentToken(token)

      await upsertNotificationSubscription({
        fcm_token: token,
        enabled: true,
        device_label: deviceLabel(),
        browser: browserLabel(),
      })

      toast.success('Daily prediction notifications enabled for this device.')
      await loadSubscriptions()
    } catch (error) {
      toast.error(error.message || 'Could not enable notifications.')
    } finally {
      setSaving(false)
    }
  }

  const disableNotifications = async () => {
    const tokenToDisable = currentToken || enabledSubscriptions[0]?.fcm_token
    if (!tokenToDisable) {
      toast.error('No active device token found to disable.')
      return
    }

    setSaving(true)
    try {
      await disableNotificationSubscription({ fcm_token: tokenToDisable })
      toast.success('Notifications disabled for this device.')
      await loadSubscriptions()
    } catch {
      toast.error('Could not disable notifications.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="glass-card rounded-2xl p-6 gold-border">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
            <Bell size={18} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Daily Push Notifications</h3>
            <p className="text-xs text-slate-500">Receive the daily gold forecast on this device.</p>
          </div>
        </div>
        <button
          onClick={loadSubscriptions}
          className="rounded-lg p-2 text-slate-500 transition-all hover:bg-amber-500/10 hover:text-amber-400"
          title="Refresh notification settings"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="mb-5 rounded-2xl border border-slate-700/40 bg-slate-900/50 p-4">
            <p className="text-sm text-white">
              {enabledSubscriptions.length > 0
                ? `${enabledSubscriptions.length} device${enabledSubscriptions.length > 1 ? 's are' : ' is'} currently opted in.`
                : 'No active device is subscribed yet.'}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Notifications are sent by the daily automation after predictions are refreshed. This setup is device-based, so each browser can opt in separately.
            </p>
            {currentDeviceSubscription && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                <CheckCircle2 size={14} />
                This browser is already enabled.
              </div>
            )}
          </div>

          <div className="mb-5 flex flex-wrap gap-3">
            <button
              onClick={enableNotifications}
              disabled={saving || Boolean(currentDeviceSubscription)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-70 ${
                currentDeviceSubscription
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : 'bg-gradient-to-r from-amber-500 to-orange-600'
              }`}
            >
              <Bell size={16} />
              {saving ? 'Working...' : currentDeviceSubscription ? 'Enabled on This Device' : 'Enable on This Device'}
            </button>
            <button
              onClick={disableNotifications}
              disabled={saving || !currentDeviceSubscription}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:border-slate-500 hover:text-white disabled:opacity-60"
            >
              <BellOff size={16} />
              Disable on This Device
            </button>
          </div>

          <div className="space-y-3">
            {subscriptions.map((item) => {
              const isCurrentDevice = item.fcm_token === currentToken
              return (
                <div key={item.fcm_token} className="flex items-start justify-between rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800">
                      <Smartphone size={16} className="text-slate-300" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {item.device_label || 'Registered device'}
                        {isCurrentDevice && <span className="ml-2 text-xs text-amber-300">(this device)</span>}
                      </p>
                      <p className="text-xs text-slate-500">{item.browser || 'Browser'} | updated {item.updated_at ? new Date(item.updated_at).toLocaleString() : '--'}</p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                      item.enabled ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-700/60 text-slate-300'
                    }`}
                  >
                    {item.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
