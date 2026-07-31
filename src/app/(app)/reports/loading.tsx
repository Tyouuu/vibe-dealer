function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink-800 ${className}`} />
}

export default function ReportsLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="app-card">
        <Bone className="h-8 w-52" />
        <Bone className="mt-2 h-3 w-64" />
        <div className="mb-4 mt-4 flex items-center justify-between">
          <Bone className="h-9 w-44 rounded-lg" />
          <Bone className="h-9 w-36 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-0 overflow-hidden rounded-2xl border border-ink-800 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 sm:p-5">
              <Bone className="h-3 w-24" />
              <Bone className="mt-2 h-7 w-20" />
              <Bone className="mt-1 h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
      {Array.from({ length: 2 }).map((_, section) => (
        <div key={section} className="app-card">
          <Bone className="h-4 w-32" />
          <Bone className="mt-1 mb-3.5 h-3 w-56" />
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Bone className="h-4 flex-1 max-w-40" />
                <Bone className="h-4 w-20" />
                <Bone className="h-4 w-24" />
                <Bone className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
