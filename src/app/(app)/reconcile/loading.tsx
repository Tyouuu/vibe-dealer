function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink-800 ${className}`} />
}

export default function ReconcileLoading() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.55fr_1fr]">
      <div className="app-card">
        <div className="mb-4 flex items-start justify-between">
          <Bone className="h-8 w-52" />
          <Bone className="h-9 w-40 rounded-lg" />
        </div>
        <Bone className="mb-3 h-4 w-40" />
        <div className="grid grid-cols-2 gap-3">
          <Bone className="h-20 rounded-2xl" />
          <Bone className="h-20 rounded-2xl" />
        </div>
        <Bone className="mt-3 h-16 rounded-xl" />
        <Bone className="mt-3 h-10 rounded-lg" />
        <div className="mt-5 flex flex-col gap-3 border-t border-ink-800 pt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Bone className="h-4 w-16" />
              <Bone className="h-4 flex-1 max-w-40" />
              <Bone className="h-4 w-20" />
              <Bone className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
      <div className="app-card">
        <Bone className="mb-3.5 h-4 w-36" />
        <div className="flex flex-col gap-3.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Bone key={i} className="h-10 rounded-lg" />
          ))}
          <Bone className="h-10 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
