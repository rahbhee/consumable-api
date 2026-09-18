import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "./rate-limit";

// Called at the top of every route handler (API routes run on the Node
// runtime by default, unlike middleware, so the Postgres-backed limiter
// works here without the Edge-runtime problem that ruled out doing this
// in middleware.ts instead). Centralizes the check + 429 response so each
// route's own logic doesn't repeat it.
export async function rateLimitOrNull(req: NextRequest): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const { allowed, retryAfterSeconds } = await checkRateLimit(`ip:${ip}`);
  if (!allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests. Try again shortly." } },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }
  return null;
}
