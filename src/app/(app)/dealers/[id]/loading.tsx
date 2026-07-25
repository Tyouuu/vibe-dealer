function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink-800 ${className}`} />
}

export default function DealerDetailLoading() {
  return (
    <div className="flex flex-col gap-5">
      <Bone className="h-4 w-28" />
      <div className="app-card">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Bone className="h-11 w-11 shrink-0 rounded-full" />
            <div>
              <Bone className="h-5 w-40" />
              <Bone className="mt-1.5 h-3 w-24" />
            </div>
          </div>
          <div className="flex gap-2.5">
            <Bone className="h-7 w-16 rounded-full" />
            <Bone className="h-7 w-16 rounded-lg" />
            <Bone className="h-7 w-32 rounded-lg" />
          </div>
        </div>
        <div className="mt-3.5 flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Bone key={i} className="h-7 w-28 rounded-full" />
          ))}
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_296px]">
        <div className="flex flex-col gap-5">
          <div className="app-card">
            <Bone className="mb-3 h-4 w-36" />
            <div className="flex flex-col gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Bone className="h-4 w-20" />
                  <Bone className="h-4 flex-1 max-w-32" />
                  <Bone className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="app-card">
            <Bone className="mb-3 h-4 w-20" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Bone key={i} className="mb-2 h-8" />
            ))}
          </div>
          <Bone className="h-28 rounded-2xl" />
        </div>
      </div>
    </div>
  )
}
