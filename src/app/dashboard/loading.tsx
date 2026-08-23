import { Card } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="mb-6 h-8 w-32 animate-pulse rounded bg-ink/5" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="mb-2 h-8 w-8 animate-pulse rounded-lg bg-ink/5" />
            <div className="mb-1 h-6 w-10 animate-pulse rounded bg-ink/5" />
            <div className="h-3 w-20 animate-pulse rounded bg-ink/5" />
          </Card>
        ))}
      </div>
    </div>
  );
}
