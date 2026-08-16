import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { DialerPageClient } from "./dialer-page-client";

export default async function DialerPage() {
  const supabase = await createClient();

  const [{ data: contacts }, { data: recentCalls }] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, full_name, phone, company")
      .not("phone", "is", null)
      .order("full_name", { ascending: true }),
    supabase
      .from("calls")
      .select("contact_id, direction, status, duration_seconds, disposition, created_at")
      .not("contact_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  type CallSummary = {
    contact_id: string | null;
    direction: "outbound" | "inbound";
    status: string;
    duration_seconds: number | null;
    disposition: string | null;
    created_at: string;
  };

  const lastCallByContact = new Map<string, CallSummary>();
  for (const c of recentCalls ?? []) {
    if (c.contact_id && !lastCallByContact.has(c.contact_id)) lastCallByContact.set(c.contact_id, c);
  }

  const rows = (contacts ?? [])
    .map((c) => ({ ...c, lastCall: lastCallByContact.get(c.id) ?? null }))
    .sort((a, b) => {
      const at = a.lastCall?.created_at;
      const bt = b.lastCall?.created_at;
      if (at && bt) return bt.localeCompare(at);
      if (at) return -1;
      if (bt) return 1;
      return a.full_name.localeCompare(b.full_name);
    });

  return (
    <Suspense fallback={null}>
      <DialerPageClient contacts={rows} />
    </Suspense>
  );
}
