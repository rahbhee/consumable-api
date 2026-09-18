import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { rateLimitOrNull } from "@/lib/with-rate-limit";
import { dataResponse, errorResponse } from "@/lib/envelope";
import { categoriesQuerySchema } from "@/lib/query-schemas";
import { encodeCursor, decodeCursor, buildCursorWhere } from "@/lib/pagination";
import { Prisma } from "@prisma/client";

// GET /api/v1/categories -- list, paginated, sortable.
export async function GET(req: NextRequest) {
  const limited = await rateLimitOrNull(req);
  if (limited) return limited;

  const parsed = categoriesQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid query", 400);
  }
  const { limit, cursor, sort, order } = parsed.data;

  let cursorWhere: Prisma.CategoryWhereInput | undefined;
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (!decoded) return errorResponse("BAD_REQUEST", "Invalid cursor", 400);
    cursorWhere = buildCursorWhere(sort, order, decoded) as Prisma.CategoryWhereInput;
  }

  const [total, rows] = await Promise.all([
    db.category.count(),
    db.category.findMany({
      where: cursorWhere,
      orderBy: [{ [sort]: order }, { id: order }],
      take: limit + 1,
    }),
  ]);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor((last as unknown as Record<string, string>)[sort], last.id) : null;

  return dataResponse(page, { total, limit, hasMore, nextCursor });
}
