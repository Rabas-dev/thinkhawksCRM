export default function Loading() {
  return (
    <div className="px-8 py-8">
      <div className="mb-6 h-8 w-32 animate-pulse rounded bg-ink/5" />
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="w-72 shrink-0">
            <div className="mb-2 h-4 w-24 animate-pulse rounded bg-ink/5" />
            <div className="h-40 animate-pulse rounded-xl bg-ink/[0.03]" />
          </div>
        ))}
      </div>
    </div>
  );
}
