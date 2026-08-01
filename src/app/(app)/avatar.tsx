import { avatarHex, avatarInitials } from '@/lib/avatar'

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[8px] text-[12px] font-extrabold text-white"
      style={{ width: size, height: size, background: avatarHex(name) }}
    >
      {avatarInitials(name)}
    </span>
  )
}
