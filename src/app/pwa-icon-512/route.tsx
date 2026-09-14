import { markIcon } from '@/lib/pwa-icon'

// Fixed, predictable URL — manifest.ts references it literally by path.
export function GET() {
  return markIcon(512)
}
