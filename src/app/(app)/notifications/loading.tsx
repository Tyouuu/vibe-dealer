function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink-800 ${className}`} />
}

export default function NotificationsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <Bone className="h-8 w-40" />
        <Bone className="h-4 w-44" />
      </div>
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="app-card flex items-center gap-3">
            <Bone className="h-9 w-9 shrink-0 rounded-full" />
            <div className="flex-1">
              <Bone className="h-4 w-48" />
              <Bone className="mt-1.5 h-3 w-64" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
