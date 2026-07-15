function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink-800 ${className}`} />
}

// Shape-matched skeleton instead of a spinner — the docket-hero, stat row,
// and cards below all reserve their real layout so nothing jumps on load.
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="docket-hero">
        <div className="docket-half">
          <Bone className="h-3 w-32" />
          <Bone className="mt-3 h-10 w-40" />
        </div>
        <div className="docket-perforation" aria-hidden="true" />
        <div className="docket-half">
          <Bone className="h-3 w-32" />
          <Bone className="mt-3 h-10 w-36" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="app-tile flex items-center gap-3">
            <Bone className="h-9 w-9 shrink-0 rounded-full" />
            <div className="flex-1">
              <Bone className="h-3 w-20" />
              <Bone className="mt-2 h-4 w-12" />
            </div>
          </div>
        ))}
      </div>

      <div className="app-card">
        <Bone className="mb-4 h-4 w-56" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <Bone className="h-3 w-24" />
              <Bone className="mt-2 h-5 w-20" />
            </div>
          ))}
        </div>
      </div>

      <div className="app-card">
        <Bone className="mb-4 h-4 w-44" />
        <Bone className="h-44 w-full" />
      </div>
    </div>
  )
}
