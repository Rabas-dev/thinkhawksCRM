import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (id) {
    const { data, error } = await supabase
      .from("calls")
      .select("*, contacts(id, full_name)")
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ call: data });
  }

  // Polled by the dialer to screen-pop inbound calls the moment they start
  // ringing — since the browser has no persistent connection to Telnyx.
  const inboundSince = request.nextUrl.searchParams.get("inbound_since");
  if (inboundSince) {
    const { data, error } = await supabase
      .from("calls")
      .select("*, contacts(id, full_name)")
      .eq("direction", "inbound")
      .eq("status", "ringing")
      .gt("created_at", inboundSince)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ calls: data });
  }

  const contactId = request.nextUrl.searchParams.get("contact_id");
  let query = supabase
    .from("calls")
    .select("*, contacts(id, full_name)")
    .order("created_at", { ascending: false })
    .limit(contactId ? 200 : 100);

  if (contactId) query = query.eq("contact_id", contactId);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ calls: data });
}
