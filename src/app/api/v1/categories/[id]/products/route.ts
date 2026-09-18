import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { rateLimitOrNull } from "@/lib/with-rate-limit";
import { dataResponse, errorResponse } from "@/lib/envelope";
import { productsQuerySchema } from "@/lib/query-schemas";

// GET /api/v1/categories/:id/products -- nested resource: this category's
// products, still paginated like any other list endpoint.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitOrNull(req);
  if (limited) return limited;

  const { id } = await params;
  const category = await db.category.findUnique({ where: { id } });
  if (!category) return errorResponse("NOT_FOUND", "Category not found", 404);

  const parsed = productsQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid query", 400);
  }
  const { limit, sort, order } = parsed.data;

  const [total, products] = await Promise.all([
    db.product.count({ where: { categoryId: id } }),
    db.product.findMany({
      where: { categoryId: id },
      orderBy: [{ [sort]: order }, { id: order }],
      take: limit,
    }),
  ]);

  return dataResponse(products, { total, limit, hasMore: total > limit });
}
