import type { Role } from '@/lib/auth/dal'
import { ROLE_LABEL } from './types'

export function PermissionDenied({ role, action }: { role: Role; action: string }) {
  return <div className="app-card text-sm text-paper-dim">Your role ({ROLE_LABEL[role]}) does not have permission to {action}.</div>
}
