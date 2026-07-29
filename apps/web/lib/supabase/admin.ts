import "server-only";

import type { Database } from "@palhatch/contracts";
import { createClient } from "@supabase/supabase-js";

import { getPublicSupabaseConfig } from "./config";

export function createAdminSupabaseClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY_REQUIRED");
  const { url } = getPublicSupabaseConfig();
  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
