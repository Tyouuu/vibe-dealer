import type { Role } from '@/lib/auth/dal'

export type Notification = { title: string; subtitle: string }

export const ROLE_LABEL: Record<Role, string> = { master: 'Master', accountant: 'Accountant', cs: 'CS' }
