import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toE164 } from "@/lib/utils";

const schema = z.object({
  contact_id: z.string().uuid().optional(),
  phone: z.string().min(5).optional(),
});

/**
 * Pre-registers a `calls` row before the browser originates the actual call
 * over WebRTC (src/lib/dialer-context.tsx) — the row id rides along as the
 * WebRTC SDK's `clientState`, so the Call Control webhook can attach Telnyx's
 * ids to the right row once the call actually starts ringing.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { contact_id } = parsed.data;

  let contactPhone = parsed.data.phone;
  if (contact_id) {
    const { data: contact } = await supabase.from("contacts").select("id, phone").eq("id", contact_id).single();
    if (!contact?.phone) {
      return NextResponse.json({ error: "This contact has no phone on file" }, { status: 400 });
    }
    contactPhone = contact.phone;
  }
  if (!contactPhone) {
    return NextResponse.json({ error: "No number to dial" }, { status: 400 });
  }

  const { data: call } = await supabase
    .from("calls")
    .insert({
      contact_id: contact_id ?? null,
      direction: "outbound",
      status: "initiated",
      contact_phone: toE164(contactPhone),
    })
    .select("id")
    .single();

  if (!call) {
    return NextResponse.json({ error: "Couldn't start the call" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: call.id });
}
