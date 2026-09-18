import { NextResponse } from "next/server";

// One response shape, used by every endpoint -- no endpoint returns a bare
// array or a differently-shaped object. See README "Design decisions" for
// why this shape specifically.
export function dataResponse<T>(
  data: T,
  meta: { total: number; limit: number; hasMore: boolean; offset?: number; nextCursor?: string | null },
  status = 200
) {
  return NextResponse.json({ data, meta }, { status });
}

export function itemResponse<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

// One error shape, always with an honest status code alongside it -- never
// 200 with an error described in the body.
export function errorResponse(code: string, message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}
