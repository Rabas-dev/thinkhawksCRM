import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sendSms, TELNYX_NUMBER } from "@/lib/telnyx";
import { toE164 } from "@/lib/utils";

const schema = z.object({
  contact_id: z.string().uuid(),
  body: z.string().min(1),
});

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
  const { contact_id, body } = parsed.data;

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, phone")
    .eq("id", contact_id)
    .single();

  if (!contact?.phone) {
    return NextResponse.json({ error: "This contact has no phone on file" }, { status: 400 });
  }

  if (!TELNYX_NUMBER) {
    return NextResponse.json({ error: "SMS isn't configured yet — see SETUP.md." }, { status: 503 });
  }

  const toNumber = toE164(contact.phone);

  try {
    const message = await sendSms({ to: toNumber, from: TELNYX_NUMBER, text: body });

    await supabase.from("messages").insert({
      contact_id,
      telnyx_message_id: message.id,
      direction: "outbound",
      channel: "sms",
      body,
      status: message.to?.[0]?.status ?? "queued",
    });

    await supabase.from("activities").insert({
      contact_id,
      type: "message",
      title: "SMS sent",
      body,
    });

    return NextResponse.json({ ok: true, id: message.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't send that message" },
      { status: 502 },
    );
  }
}
