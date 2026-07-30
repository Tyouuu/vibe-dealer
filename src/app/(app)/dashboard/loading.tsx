function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink-800 ${className}`} />
}

// Shape-matched skeleton instead of a spinner — mirrors the 4-card KPI grid,
// trend/region row, and recent-transactions card so nothing jumps on load.
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-5">
      <Bone className="h-8 w-40" />
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="app-tile flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <Bone className="h-3 w-24" />
              <Bone className="h-9 w-9 shrink-0 rounded-[10px]" />
            </div>
            <Bone className="h-7 w-28" />
            <Bone className="h-3 w-32" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="app-card">
          <Bone className="mb-4 h-4 w-44" />
          <Bone className="h-52 w-full" />
        </div>
        <div className="app-card">
          <Bone className="mb-1 h-4 w-32" />
          <Bone className="mb-3.5 mt-2 h-3 w-52" />
          <div className="flex flex-wrap gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Bone key={i} className="h-7 w-24 rounded-full" />
            ))}
          </div>
        </div>
      </div>

      <div className="app-card">
        <Bone className="mb-4 h-4 w-40" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Bone className="h-4 w-20" />
              <Bone className="h-4 flex-1 max-w-40" />
              <Bone className="h-4 w-24" />
              <Bone className="h-4 w-16 rounded-full" />
              <Bone className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
