import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sid = request.nextUrl.searchParams.get("sid");
  if (sid) {
    const { data, error } = await supabase
      .from("calls")
      .select("*, contacts(id, full_name)")
      .eq("twilio_call_sid", sid)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ call: data });
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
