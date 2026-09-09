import type { SupabaseClient } from "@supabase/supabase-js";
import { EMAIL_FROM } from "@/lib/sendgrid";

export type EmailSender = { id: string; email: string; display_name: string; is_default: boolean };

const SENDER_COLUMNS = "id, email, display_name, is_default";

/**
 * Resolves which "From" address/name a send should use — always from the
 * email_senders allowlist, never a free-typed address (see the table's
 * comment in supabase/schema.sql for why). Two call shapes, deliberately
 * different failure behavior:
 *  - `email`: an agent explicitly picked/typed one for this send (compose
 *    UI) — unknown must be a real error, not a silent fallback, or a typo
 *    would quietly send from the wrong identity.
 *  - `id`: a stored reference (a campaign's sender_id) — falls through to
 *    the default sender instead of throwing, so a campaign whose chosen
 *    sender was deleted after creation doesn't hard-fail at send time.
 * With neither, or if the table is completely empty (fresh install before
 * the migration's seed row, or the seed itself got deleted), falls back to
 * EMAIL_FROM/"Think Hawks" as a last resort.
 */
export async function resolveSender(
  supabase: SupabaseClient,
  requested?: { id?: string | null; email?: string | null },
): Promise<EmailSender> {
  if (requested?.id) {
    const { data } = await supabase.from("email_senders").select(SENDER_COLUMNS).eq("id", requested.id).maybeSingle();
    if (data) return data;
  } else if (requested?.email) {
    const { data } = await supabase.from("email_senders").select(SENDER_COLUMNS).eq("email", requested.email).maybeSingle();
    if (data) return data;
    throw new Error("Unknown sender address");
  }

  const { data: defaultSender } = await supabase
    .from("email_senders")
    .select(SENDER_COLUMNS)
    .eq("is_default", true)
    .maybeSingle();
  if (defaultSender) return defaultSender;

  return { id: "", email: EMAIL_FROM, display_name: "Think Hawks", is_default: true };
}
