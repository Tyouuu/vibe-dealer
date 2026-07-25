function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink-800 ${className}`} />
}

export default function AccountLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <Bone className="h-8 w-48" />
      {Array.from({ length: 4 }).map((_, section) => (
        <section key={section}>
          <Bone className="mb-4 h-4 w-32" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Bone className="h-14 rounded-lg" />
            <Bone className="h-14 rounded-lg" />
          </div>
        </section>
      ))}
    </div>
  )
}
