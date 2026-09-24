import 'server-only'
import webpush from 'web-push'
import * as Sentry from '@sentry/nextjs'
import { createServiceClient } from '@/lib/supabase/service'
import { reportToSentry } from '@/lib/sentry-report'
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/preferences'
import { pickRecipients } from '@/lib/push-recipients'
import { packagePush, simOrderPush, type PushPayload } from '@/lib/push-messages'

// Off unless the three VAPID variables exist. The app runs the same with or without
// them (the demo deployment has none): nothing is sent, and Account Settings says
// phone alerts are not set up rather than offering a switch that cannot work.
export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT)
}

function configure() {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string }

export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<{ sent: number; removed: number; failed: number }> {
  const result = { sent: 0, removed: 0, failed: 0 }
  if (!pushConfigured() || userIds.length === 0) return result
  configure()

  const db = createServiceClient()
  const { data } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('user_id', userIds)
  const subs = (data ?? []) as Sub[]

  const outcomes = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), {
        TTL: 60 * 60 * 24,
        urgency: 'high',
        timeout: 8000,
      }),
    ),
  )

  const gone: string[] = []
  const failed: string[] = []
  let unexpected: { status: number | undefined; message: string } | null = null
  outcomes.forEach((o, i) => {
    if (o.status === 'fulfilled') {
      result.sent++
      return
    }
    const status = (o.reason as { statusCode?: number }).statusCode
    // 404 and 410 are the push service saying this phone has uninstalled or revoked:
    // the subscription can never work again, so it goes rather than failing forever.
    if (status === 404 || status === 410) gone.push(subs[i].id)
    else {
      failed.push(subs[i].id)
      // 400/401/403 mean the request itself was refused — a wrong or missing VAPID
      // key, not a dead phone — and that is a fault worth hearing about.
      if (status === 400 || status === 401 || status === 403) unexpected = { status, message: String((o.reason as Error).message).slice(0, 200) }
    }
  })
  result.removed = gone.length
  result.failed = failed.length

  if (gone.length) await db.from('push_subscriptions').delete().in('id', gone)
  if (failed.length) await db.from('push_subscriptions').update({ failed_at: new Date().toISOString() }).in('id', failed)
  if (unexpected) {
    const u = unexpected as { status: number | undefined; message: string }
    await reportToSentry(() => Sentry.captureException(new Error(`[push] the push service refused a message (${u.status}): ${u.message}`)))
  }
  return result
}

export type ShipEvent = {
  kind: 'sim_order' | 'package_sale'
  refId: string
  dealerId: string
  actorId: string
  quantity: number
  simType?: string
  pkg?: string
}

// Something new is waiting to be shipped. Never throws: this runs after the response
// has gone, on top of a sale or order that is already saved, and a failed alert must
// not be able to turn either into an error.
export async function notifyShipQueue(ev: ShipEvent): Promise<void> {
  try {
    if (!pushConfigured()) return
    const db = createServiceClient()

    // Claim this parcel first. A repeat (double-tap, or the retry that returns the
    // existing order) finds the row already there and stays quiet.
    const claim = await db.from('push_events').insert({ ref_kind: ev.kind, ref_id: ev.refId })
    if (claim.error) {
      if (claim.error.code === '23505') return
      throw new Error(claim.error.message)
    }

    const roles = NOTIFICATION_CATEGORIES.find((c) => c.key === 'deliveries')?.roles ?? []
    const [{ data: dealer }, { data: profiles }, { data: prefs }] = await Promise.all([
      db.from('dealers').select('company_name').eq('id', ev.dealerId).maybeSingle(),
      db.from('profiles').select('id, role, active, notifications_enabled').in('role', roles),
      db.from('notification_preferences').select('user_id, category, enabled').eq('category', 'deliveries'),
    ])

    const recipients = pickRecipients(profiles ?? [], prefs ?? [], 'deliveries', ev.actorId)
    if (!recipients.length) return

    const name = dealer?.company_name ?? 'A dealer'
    const payload =
      ev.kind === 'sim_order'
        ? simOrderPush({ refId: ev.refId, dealer: name, quantity: ev.quantity, simType: ev.simType ?? 'physical' })
        : packagePush({ refId: ev.refId, dealer: name, pkg: ev.pkg ?? '?', quantity: ev.quantity })
    await sendPushToUsers(recipients, payload)
  } catch (e) {
    await reportToSentry(() => Sentry.captureException(e, { extra: { kind: ev.kind, refId: ev.refId } }))
  }
}
