export function getPublicSupabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url === undefined || anonKey === undefined) {
    throw new Error("PUBLIC_SUPABASE_CONFIGURATION_REQUIRED");
  }
  return { url, anonKey };
}

export function getPublicAppUrl(): string {
  const value = process.env.NEXT_PUBLIC_APP_URL;
  if (!value) throw new Error("NEXT_PUBLIC_APP_URL_REQUIRED");
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error("NEXT_PUBLIC_APP_URL_INVALID");
  }
  return url.origin;
}
