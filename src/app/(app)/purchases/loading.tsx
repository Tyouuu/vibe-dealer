function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink-800 ${className}`} />
}

export default function PurchasesLoading() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="app-card">
        <Bone className="h-8 w-48" />
        <Bone className="mt-2 mb-4 h-3 w-64" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Bone key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t border-ink-800 pt-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Bone className="h-4 w-20" />
              <Bone className="h-4 w-20" />
              <Bone className="h-4 w-16" />
              <Bone className="h-4 flex-1 max-w-32" />
              <Bone className="h-4 w-24" />
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
          <Bone className="h-10 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
