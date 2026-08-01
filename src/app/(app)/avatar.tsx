import { avatarHex, avatarInitials } from '@/lib/avatar'

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span
      // font-semibold, not font-extrabold: the token block sets a hard
      // ceiling of --fw-semibold (600) because Linear caps at 590 and Vercel
      // at 600. 800 on a 28px square was the heaviest text in the app.
      className="grid shrink-0 place-items-center rounded-[8px] text-[12px] font-semibold text-white"
      style={{ width: size, height: size, background: avatarHex(name) }}
    >
      {avatarInitials(name)}
    </span>
  )
}
