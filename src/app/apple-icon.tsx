import { markIcon } from '@/lib/pwa-icon'

// Next's file convention: this is what iOS uses when someone taps
// Share → Add to Home Screen.
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return markIcon(180)
}
