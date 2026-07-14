import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "cache-control": "private, no-store, max-age=0",
        vary: "Cookie, Authorization",
      },
    },
  );
}
