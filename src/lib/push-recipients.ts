import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@/lib/notifications/preferences'

export type PushProfile = { id: string; role: string; active: boolean | null; notifications_enabled: boolean | null }
export type PushPref = { user_id: string; category: string; enabled: boolean }

// Who a phone alert is for: the roles that category belongs to (the same list that
// decides who is shown its toggle on Account Settings), who are switched on, who
// have not turned notifications off overall or this category off in particular —
// and not the person who just did the thing. Nobody needs their own action read
// back to them.
//
// Opt-out, like the rest of the notification centre: no row means on.
export function pickRecipients(
  profiles: PushProfile[],
  prefs: PushPref[],
  category: NotificationCategory,
  actorId?: string,
): string[] {
  const roles = NOTIFICATION_CATEGORIES.find((c) => c.key === category)?.roles ?? []
  const off = new Set(prefs.filter((p) => p.category === category && p.enabled === false).map((p) => p.user_id))
  return profiles
    .filter(
      (p) =>
        (roles as string[]).includes(p.role) &&
        p.active !== false &&
        p.notifications_enabled !== false &&
        !off.has(p.id) &&
        p.id !== actorId,
    )
    .map((p) => p.id)
}
