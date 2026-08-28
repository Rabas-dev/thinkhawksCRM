import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Claims a webhook event id so it's only ever processed once. Telnyx (and
 * SendGrid) retry a delivery that didn't get a fast 2xx back — a real risk
 * on Hostinger's cold-starting host, and previously unguarded (flagged in
 * the Telnyx call audit): a retried call.initiated could insert a second
 * `calls` row for one real call.
 *
 * Returns true the first time an event id is seen (caller should process
 * it), false on every subsequent delivery of the same id (caller should
 * just return 200 without reprocessing). Fails open (returns true) on an
 * unrelated DB error — a broken idempotency table shouldn't cause us to
 * silently drop a real event.
 */
export async function claimWebhookEvent(
  supabase: SupabaseClient,
  eventId: string | undefined,
  source: string,
): Promise<boolean> {
  if (!eventId) return true;
  const { error } = await supabase.from("processed_webhook_events").insert({ event_id: eventId, source });
  if (!error) return true;
  return error.code !== "23505";
}
