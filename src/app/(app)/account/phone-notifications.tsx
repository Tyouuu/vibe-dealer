'use client'

import { useEffect, useState, useTransition } from 'react'
import { getPushStatus, removePushSubscription, savePushSubscription, sendTestPush } from './actions'

// Which of these the visitor is in decides everything on screen, and most of them are
// not "off": an iPhone that has not been added to the Home Screen cannot subscribe at
// all, and saying only "not supported" there would send someone away from a feature
// that works fine once the app is installed.
type State = 'checking' | 'unsupported' | 'install-first' | 'blocked' | 'off' | 'on'

function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function PhoneNotifications({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>('checking')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    async function detect() {
      const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
      if (!capable) return isIos() && !isInstalled() ? 'install-first' : 'unsupported'
      if (Notification.permission === 'denied') return 'blocked'
      const reg = await navigator.serviceWorker.getRegistration('/')
      const sub = await reg?.pushManager.getSubscription()
      // On this phone only if the browser has a subscription AND the server knows it —
      // either half alone means the switch would say on while nothing arrives.
      return sub && (await getPushStatus(sub.endpoint)) ? 'on' : 'off'
    }
    detect()
      .then((s) => !cancelled && setState(s))
      .catch(() => !cancelled && setState('unsupported'))
    return () => {
      cancelled = true
    }
  }, [])

  function turnOn() {
    setMessage(null)
    startTransition(async () => {
      try {
        // Asked from the tap, never on page load: a browser that is asked without a
        // gesture treats the answer as spam and may stop offering the question.
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          setState(permission === 'denied' ? 'blocked' : 'off')
          return
        }
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
        await navigator.serviceWorker.ready
        // An old subscription made under a different key cannot be reused.
        await (await reg.pushManager.getSubscription())?.unsubscribe()
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(publicKey) })
        const json = sub.toJSON()
        const saved = await savePushSubscription(
          { endpoint: json.endpoint ?? '', keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } },
          navigator.userAgent,
        )
        if (!saved.ok) {
          await sub.unsubscribe()
          setMessage(saved.error ?? 'Could not turn this on.')
          return
        }
        setState('on')
      } catch {
        setMessage('Could not turn this on. Check the connection and try again.')
      }
    })
  }

  function turnOff() {
    setMessage(null)
    startTransition(async () => {
      const reg = await navigator.serviceWorker.getRegistration('/')
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await removePushSubscription(sub.endpoint)
        await sub.unsubscribe()
      }
      setState('off')
    })
  }

  function test() {
    setMessage(null)
    startTransition(async () => {
      const r = await sendTestPush()
      setMessage(r.ok ? 'Sent. It should arrive on this phone in a few seconds.' : (r.error ?? 'Could not send a test.'))
    })
  }

  return (
    <div className="rounded-lg border border-ink-800 px-3.5 py-3">
      <p className="text-sm font-semibold text-paper">On this phone</p>
      <p className="mt-0.5 text-[12px] text-paper-dim">
        A notification when a SIM order or a package needs shipping, even with the app closed. It follows the Deliveries switch above.
      </p>

      <div className="mt-3 flex flex-col gap-2.5" aria-live="polite">
        {state === 'checking' && <p className="text-[13px] text-paper-dim">Checking this device…</p>}

        {state === 'unsupported' && (
          <p className="text-[13px] text-paper-dim">
            This browser cannot receive phone alerts. Use Chrome on Android, or Safari on an iPhone with iOS 16.4 or newer.
          </p>
        )}

        {state === 'install-first' && (
          <div className="text-[13px] text-paper-dim">
            <p className="font-semibold text-paper">On iPhone, add the app to your Home Screen first.</p>
            <ol className="mt-1 list-decimal pl-5">
              <li>Tap the Share button in Safari.</li>
              <li>Choose Add to Home Screen.</li>
              <li>Open Vibe456 from the new icon, sign in, and come back to this page.</li>
            </ol>
          </div>
        )}

        {state === 'blocked' && (
          <p className="text-[13px] text-paper-dim">
            Notifications are blocked for this site on this phone. Allow them in the browser&apos;s site settings, then reload this page.
          </p>
        )}

        {state === 'off' && (
          <div>
            <button type="button" onClick={turnOn} disabled={busy} className="btn-primary py-2 text-sm disabled:opacity-60">
              {busy ? 'Turning on…' : 'Turn on for this phone'}
            </button>
          </div>
        )}

        {state === 'on' && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-paper">On for this phone.</span>
            <button type="button" onClick={test} disabled={busy} className="btn-ghost py-1.5 text-xs disabled:opacity-60">
              Send a test
            </button>
            <button type="button" onClick={turnOff} disabled={busy} className="btn-ghost py-1.5 text-xs disabled:opacity-60">
              Turn off
            </button>
          </div>
        )}

        {message && <p className="text-[13px] text-paper-dim">{message}</p>}
      </div>
    </div>
  )
}
