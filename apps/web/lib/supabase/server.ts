import type { Database } from "@palhatch/contracts";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicSupabaseConfig } from "./config";

export type SupabaseCookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function createServerSupabaseClient(
  onCookiesSet?: (cookies: SupabaseCookieToSet[]) => void,
) {
  const cookieStore = await cookies();
  const { url, anonKey } = getPublicSupabaseConfig();
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        onCookiesSet?.(cookiesToSet);
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. Middleware refreshes sessions.
        }
      },
    },
  });
}
