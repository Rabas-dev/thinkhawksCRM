import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.from("contacts").select("tags");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tags = Array.from(new Set((data ?? []).flatMap((c) => c.tags ?? []))).sort();
  return NextResponse.json({ tags });
}
