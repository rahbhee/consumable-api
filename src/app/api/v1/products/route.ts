import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { rateLimitOrNull } from "@/lib/with-rate-limit";
import { dataResponse, errorResponse } from "@/lib/envelope";
import { productsQuerySchema } from "@/lib/query-schemas";
import { encodeCursor, decodeCursor, buildCursorWhere } from "@/lib/pagination";
import { Prisma } from "@prisma/client";

// GET /api/v1/products?category=slug&minPrice=...&maxPrice=...&sort=price&order=desc
// Filtering on two fields (category, price range) and sorting on any of
// three, all validated up front -- an unknown sort value is rejected by
// the Zod enum in productsQuerySchema before this handler ever runs a
// query, not silently defaulted to unsorted.
export async function GET(req: NextRequest) {
  const limited = await rateLimitOrNull(req);
  if (limited) return limited;

  const parsed = productsQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid query", 400);
  }
  const { limit, cursor, category, minPrice, maxPrice, sort, order } = parsed.data;

  const filters: Prisma.ProductWhereInput = {};
  if (category) {
    const categoryRow = await db.category.findUnique({ where: { slug: category } });
    if (!categoryRow) return dataResponse([], { total: 0, limit, hasMore: false, nextCursor: null });
    filters.categoryId = categoryRow.id;
  }
  if (minPrice !== undefined || maxPrice !== undefined) {
    filters.priceMinorUnits = {
      ...(minPrice !== undefined && { gte: minPrice }),
      ...(maxPrice !== undefined && { lte: maxPrice }),
    };
  }

  const sortField = sort === "price" ? "priceMinorUnits" : sort;

  let where: Prisma.ProductWhereInput = filters;
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (!decoded) return errorResponse("BAD_REQUEST", "Invalid cursor", 400);
    where = { AND: [filters, buildCursorWhere(sortField, order, decoded) as Prisma.ProductWhereInput] };
  }

  const [total, rows] = await Promise.all([
    db.product.count({ where: filters }),
    db.product.findMany({
      where,
      include: { category: true },
      orderBy: [{ [sortField]: order }, { id: order }],
      take: limit + 1,
    }),
  ]);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor((last as unknown as Record<string, string>)[sortField], last.id) : null;

  return dataResponse(page, { total, limit, hasMore, nextCursor });
}
