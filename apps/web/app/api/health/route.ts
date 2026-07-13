export function GET(): Response {
  return Response.json({
    status: "ok",
    service: "web",
    version: "0.0.0",
    timestamp: new Date().toISOString(),
  });
}
