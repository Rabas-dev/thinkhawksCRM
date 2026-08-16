import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { EmailPageClient } from "./email-page-client";

export default async function EmailPage() {
  const supabase = await createClient();

  const [{ data: contacts }, { data: recentEmails }] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, full_name, email, company")
      .not("email", "is", null)
      .order("full_name", { ascending: true }),
    supabase
      .from("emails")
      .select("contact_id, subject, text_body, direction, status, created_at")
      .not("contact_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  type EmailSummary = {
    contact_id: string | null;
    subject: string | null;
    text_body: string | null;
    direction: "outbound" | "inbound";
    status: string;
    created_at: string;
  };

  const lastEmailByContact = new Map<string, EmailSummary>();
  for (const e of recentEmails ?? []) {
    if (e.contact_id && !lastEmailByContact.has(e.contact_id)) lastEmailByContact.set(e.contact_id, e);
  }

  const rows = (contacts ?? [])
    .map((c) => ({ ...c, lastEmail: lastEmailByContact.get(c.id) ?? null }))
    .sort((a, b) => {
      const at = a.lastEmail?.created_at;
      const bt = b.lastEmail?.created_at;
      if (at && bt) return bt.localeCompare(at);
      if (at) return -1;
      if (bt) return 1;
      return a.full_name.localeCompare(b.full_name);
    });

  return (
    <Suspense fallback={null}>
      <EmailPageClient contacts={rows} />
    </Suspense>
  );
}
