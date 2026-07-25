function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink-800 ${className}`} />
}

export default function OnboardLoading() {
  return (
    <div className="grid gap-5 md:grid-cols-[1.3fr_1fr]">
      <div className="app-card">
        <Bone className="mb-4 h-8 w-48" />
        {Array.from({ length: 3 }).map((_, section) => (
          <div key={section} className="mb-4">
            <Bone className="mb-3 h-4 w-32" />
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <Bone className="h-10 rounded-lg" />
              <Bone className="h-10 rounded-lg" />
            </div>
          </div>
        ))}
        <Bone className="h-10 rounded-lg" />
      </div>
      <div className="app-card">
        <Bone className="mb-2 h-4 w-40" />
        <Bone className="h-16" />
      </div>
    </div>
  )
}
