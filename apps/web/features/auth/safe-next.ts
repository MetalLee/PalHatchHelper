const ALLOWED_DESTINATIONS = new Set([
  "/overview",
  "/account",
  "/data-status",
  "/pals",
  "/breeder",
  "/plans",
]);

export function safeNextPath(value: string | null | undefined): string {
  if (value === null || value === undefined || !value.startsWith("/")) {
    return "/overview";
  }
  if (value.startsWith("//") || value.includes("\\") || value.includes("\0")) {
    return "/overview";
  }
  let parsed: URL;
  try {
    parsed = new URL(value, "https://palbeacon.invalid");
  } catch {
    return "/overview";
  }
  if (parsed.origin !== "https://palbeacon.invalid") return "/overview";
  const match = parsed.pathname.match(/^\/(?:zh|en)(\/.*)$/);
  const unlocalized = match?.[1] ?? parsed.pathname;
  if (
    ![...ALLOWED_DESTINATIONS].some(
      (path) => unlocalized === path || unlocalized.startsWith(`${path}/`),
    )
  ) {
    return "/overview";
  }
  return `${parsed.pathname}${parsed.search}`;
}
