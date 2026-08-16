export default function Loading() {
  return (
    <div className="flex h-screen">
      <div className="w-72 shrink-0 border-r border-border bg-white p-4">
        <div className="h-5 w-24 animate-pulse rounded bg-black/5" />
      </div>
      <div className="flex-1 bg-section" />
      <div className="w-80 shrink-0 space-y-4 border-l border-border bg-white p-4">
        <div className="h-11 w-11 animate-pulse rounded-full bg-black/5" />
        <div className="h-40 animate-pulse rounded-xl bg-black/5" />
      </div>
    </div>
  );
}
