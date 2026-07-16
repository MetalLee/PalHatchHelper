"use client";

import type { Database } from "@palhatch/contracts";
import { createBrowserClient } from "@supabase/ssr";

import { getPublicSupabaseConfig } from "./config";

export function createBrowserSupabaseClient() {
  const { url, anonKey } = getPublicSupabaseConfig();
  return createBrowserClient<Database>(url, anonKey);
}
