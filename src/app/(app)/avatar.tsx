import { avatarHex, avatarInitials } from '@/lib/avatar'

export function Avatar({ name, size = 28, package: pkg }: { name: string; size?: number; package?: string | null }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[8px] text-[11px] font-extrabold text-white"
      style={{ width: size, height: size, background: avatarHex(pkg) }}
    >
      {avatarInitials(name)}
    </span>
  )
}
