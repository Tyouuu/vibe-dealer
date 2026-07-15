function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink-800 ${className}`} />
}

export default function DealersLoading() {
  return (
    <div className="app-card">
      <div className="mb-4 flex items-center justify-between">
        <Bone className="h-5 w-24" />
        <Bone className="h-5 w-20 rounded-full" />
      </div>
      <div className="mb-4 flex gap-3">
        <Bone className="h-9 w-72 rounded-lg" />
        <Bone className="h-9 w-40 rounded-lg" />
        <Bone className="h-9 w-24 rounded-lg" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Bone className="h-7 w-7 shrink-0 rounded-full" />
            <Bone className="h-4 flex-1 max-w-56" />
            <Bone className="h-4 w-20" />
            <Bone className="h-4 w-28" />
            <Bone className="h-4 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
