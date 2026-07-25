function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink-800 ${className}`} />
}

export default function EntryLoading() {
  return (
    <div className="grid gap-5 md:grid-cols-[1.3fr_1fr]">
      <div className="app-card">
        <Bone className="mb-4 h-8 w-44" />
        <Bone className="mb-3.5 h-4 w-32" />
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Bone className="h-10 rounded-lg" />
          <Bone className="h-10 rounded-lg" />
        </div>
        <Bone className="my-3.5 h-4 w-24" />
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Bone className="h-10 rounded-lg" />
          <Bone className="h-10 rounded-lg" />
        </div>
        <Bone className="my-3.5 h-4 w-40" />
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Bone className="h-16 rounded-lg" />
          <Bone className="h-16 rounded-lg" />
        </div>
      </div>
      <div className="app-card">
        <Bone className="mb-3 h-4 w-40" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Bone key={i} className="h-9" />
          ))}
        </div>
        <Bone className="mt-4 h-10 rounded-lg" />
      </div>
    </div>
  )
}
