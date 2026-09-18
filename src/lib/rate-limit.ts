import { db } from "@/lib/db";
import { API_CONFIG } from "@/lib/api-config";

// Fixed-window rate limiting, backed by Postgres -- same pattern used
// across every prior assessment slice this bootcamp, reused here for a
// public, unauthenticated API where IP is the only identifier available.
function windowStartFor(windowSeconds: number): Date {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  return new Date(Math.floor(now / windowMs) * windowMs);
}

export async function checkRateLimit(identifier: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const { maxRequestsPerWindow, windowSeconds } = API_CONFIG.rateLimit;
  const windowStart = windowStartFor(windowSeconds);

  const hit = await db.rateLimitHit.upsert({
    where: { identifier_route_windowStart: { identifier, route: "api", windowStart } },
    create: { identifier, route: "api", windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });

  const retryAfterSeconds = Math.max(
    0,
    Math.ceil((windowStart.getTime() + windowSeconds * 1000 - Date.now()) / 1000)
  );

  return { allowed: hit.count <= maxRequestsPerWindow, retryAfterSeconds };
}

export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const rawIp = forwardedFor?.split(",")[0]?.trim() ?? "unknown";
  // Same IPv4-mapped-IPv6 normalization bug found and fixed in Assessment 1
  // of the prior track -- applied here from the start this time.
  if (rawIp === "::1") return "127.0.0.1";
  if (rawIp.startsWith("::ffff:")) return rawIp.slice("::ffff:".length);
  return rawIp;
}
