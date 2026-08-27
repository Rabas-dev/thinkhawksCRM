import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { EmailPageClient, type SidebarRow } from "./email-page-client";

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
      .select("id, contact_id, to_address, subject, text_body, direction, status, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  type EmailSummary = {
    id: string;
    contact_id: string | null;
    to_address: string | null;
    subject: string | null;
    text_body: string | null;
    direction: "outbound" | "inbound";
    status: string;
    created_at: string;
  };

  const lastEmailByContact = new Map<string, EmailSummary>();
  // Quick sends (Compose's "just send, don't save") have no contact_id, so
  // they'd otherwise never show up anywhere in this page — there'd be no
  // record of them at all once the compose form clears. Group those by
  // recipient address instead, same idea as grouping saved ones by contact.
  const lastEmailByAddress = new Map<string, EmailSummary>();
  for (const e of recentEmails ?? []) {
    if (e.contact_id) {
      if (!lastEmailByContact.has(e.contact_id)) lastEmailByContact.set(e.contact_id, e);
    } else if (e.to_address && !lastEmailByAddress.has(e.to_address)) {
      lastEmailByAddress.set(e.to_address, e);
    }
  }

  const contactRows: SidebarRow[] = (contacts ?? []).map((c) => ({
    kind: "contact",
    id: c.id,
    full_name: c.full_name,
    email: c.email,
    company: c.company,
    lastEmail: lastEmailByContact.get(c.id) ?? null,
  }));

  const quickRows: SidebarRow[] = [...lastEmailByAddress.entries()].map(([address, lastEmail]) => ({
    kind: "quick",
    address,
    lastEmail,
  }));

  const rows = [...contactRows, ...quickRows].sort((a, b) => {
    const at = a.lastEmail?.created_at;
    const bt = b.lastEmail?.created_at;
    if (at && bt) return bt.localeCompare(at);
    if (at) return -1;
    if (bt) return 1;
    const an = a.kind === "contact" ? a.full_name : a.address;
    const bn = b.kind === "contact" ? b.full_name : b.address;
    return an.localeCompare(bn);
  });

  const contactNameById = new Map((contacts ?? []).map((c) => [c.id, c.full_name]));
  // Every individual outbound email, flattened and reverse-chronological —
  // the sidebar only ever shows the *latest* email per contact/address, so
  // there was no way to see full send history without clicking into each
  // thread one at a time.
  const sentLog = (recentEmails ?? [])
    .filter((e) => e.direction === "outbound")
    .map((e) => ({
      id: e.id,
      contact_id: e.contact_id,
      recipient: (e.contact_id && contactNameById.get(e.contact_id)) || e.to_address || "Unknown",
      to_address: e.to_address,
      subject: e.subject,
      snippet: e.text_body,
      status: e.status,
      created_at: e.created_at,
    }));

  return (
    <Suspense fallback={null}>
      <EmailPageClient rows={rows} sentLog={sentLog} />
    </Suspense>
  );
}
