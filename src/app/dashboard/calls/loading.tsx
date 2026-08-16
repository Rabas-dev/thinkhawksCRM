import { Card } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="mb-6 h-8 w-32 animate-pulse rounded bg-black/5" />
      <Card className="divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5">
            <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-black/5" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-32 animate-pulse rounded bg-black/5" />
              <div className="h-3 w-24 animate-pulse rounded bg-black/5" />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
