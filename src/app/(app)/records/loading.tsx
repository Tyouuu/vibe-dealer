function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink-800 ${className}`} />
}

export default function RecordsLoading() {
  return (
    <div className="app-card">
      <div className="mb-4 flex items-center justify-between">
        <Bone className="h-8 w-36" />
        <Bone className="h-5 w-28 rounded-full" />
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-3">
          <Bone className="h-9 w-64 rounded-lg" />
          <Bone className="h-9 w-44 rounded-lg" />
          <Bone className="h-9 w-44 rounded-lg" />
        </div>
        <Bone className="h-9 w-24 rounded-lg" />
      </div>
      <div className="mb-4 flex gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bone key={i} className="h-4 w-24" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Bone className="h-4 w-16" />
            <Bone className="h-7 w-7 shrink-0 rounded-full" />
            <Bone className="h-4 flex-1 max-w-40" />
            <Bone className="h-4 w-20" />
            <Bone className="h-4 w-16" />
            <Bone className="h-4 w-16" />
            <Bone className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
