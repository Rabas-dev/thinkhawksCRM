import { Card } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="mb-6 h-8 w-32 animate-pulse rounded bg-ink/5" />
      <Card className="grid grid-cols-7 gap-px overflow-hidden bg-border p-px">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse bg-surface" />
        ))}
      </Card>
    </div>
  );
}
