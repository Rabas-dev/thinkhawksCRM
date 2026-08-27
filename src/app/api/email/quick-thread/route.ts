import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * History for a Compose "just send, don't save" recipient — those emails
 * have contact_id null, so /api/contacts/[id] (the normal thread source)
 * can't find them. Grouped by to_address instead, same idea as a contact's
 * thread but keyed by the raw address since there's no contact row to key
 * on.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const to = request.nextUrl.searchParams.get("to")?.trim();
  if (!to) return NextResponse.json({ error: "Missing to" }, { status: 400 });

  const { data, error } = await supabase
    .from("emails")
    .select("*")
    .is("contact_id", null)
    .eq("to_address", to)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ emails: data });
}
