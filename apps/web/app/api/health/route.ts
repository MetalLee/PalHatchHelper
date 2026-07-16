export function GET(): Response {
  return Response.json(
    {
      status: "ok",
      service: "web",
      version:
        process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.APP_VERSION ?? "0.0.0",
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "public, no-cache, must-revalidate" } },
  );
}
