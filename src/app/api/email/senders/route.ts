import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Team-wide allowlist of "From" addresses email sends can use — see
 * email_senders' comment in supabase/schema.sql for why this exists as an
 * allowlist rather than letting a send specify any address.
 */

const createSchema = z.object({
  email: z.string().trim().email().max(255),
  display_name: z.string().trim().min(1).max(100),
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("email_senders")
    .select("id, email, display_name, is_default")
    .order("is_default", { ascending: false })
    .order("display_name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ senders: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // The very first sender in an install has nothing to default to, so it
  // has to be one — every later addition stays non-default until someone
  // explicitly promotes it (PATCH below).
  const { count } = await supabase.from("email_senders").select("id", { count: "exact", head: true });

  const { data, error } = await supabase
    .from("email_senders")
    .insert({ ...parsed.data, is_default: (count ?? 0) === 0 })
    .select("id, email, display_name, is_default")
    .single();

  if (error) {
    const message = error.code === "23505" ? "That address is already on the list." : error.message;
    return NextResponse.json({ error: message }, { status: error.code === "23505" ? 409 : 500 });
  }
  return NextResponse.json({ sender: data }, { status: 201 });
}

const patchSchema = z.object({ id: z.string().uuid() });

/** Promotes one sender to default, demoting whichever one currently holds it. */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Two writes, not a single conditional update — Postgres has no
  // "exactly one row true" constraint to lean on here, and this table is
  // edited rarely enough (an admin-facing settings action) that the brief
  // window between them isn't worth a transaction-wrapping RPC.
  await supabase.from("email_senders").update({ is_default: false }).eq("is_default", true);
  const { data, error } = await supabase
    .from("email_senders")
    .update({ is_default: true })
    .eq("id", parsed.data.id)
    .select("id, email, display_name, is_default")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sender: data });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data: target } = await supabase.from("email_senders").select("id, is_default").eq("id", id).maybeSingle();
  if (!target) return NextResponse.json({ error: "Sender not found" }, { status: 404 });
  if (target.is_default) {
    return NextResponse.json({ error: "Set another sender as default first." }, { status: 400 });
  }

  const { error } = await supabase.from("email_senders").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
