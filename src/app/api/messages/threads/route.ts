import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("messages")
    .select("id, contact_id, body, direction, channel, status, created_at, contacts(id, full_name, phone)")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const seen = new Set<string>();
  const threads = [];
  for (const m of data ?? []) {
    if (!m.contact_id || seen.has(m.contact_id)) continue;
    seen.add(m.contact_id);
    threads.push(m);
  }

  return NextResponse.json({ threads });
}
