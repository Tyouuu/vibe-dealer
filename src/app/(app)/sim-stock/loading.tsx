function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink-800 ${className}`} />
}

export default function SimStockLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="app-card">
        <Bone className="mb-1 h-8 w-48" />
        <Bone className="mb-3.5 h-3 w-72" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Bone key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Bone className="mt-3.5 h-16 rounded-2xl" />
      </div>
      {Array.from({ length: 2 }).map((_, section) => (
        <div key={section} className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="app-card">
            <Bone className="mb-3.5 h-4 w-32" />
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Bone className="h-4 w-20" />
                  <Bone className="h-4 flex-1 max-w-32" />
                  <Bone className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
          <div className="app-card">
            <Bone className="mb-3.5 h-4 w-28" />
            <div className="flex flex-col gap-3.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Bone key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
