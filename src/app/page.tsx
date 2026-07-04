import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/dal'

const HOME: Record<string, string> = {
  master: '/dashboard',
  accountant: '/entry',
  cs: '/onboard',
}

export default async function Home() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  redirect(HOME[user.role] ?? '/dealers')
}
