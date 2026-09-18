import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { rateLimitOrNull } from "@/lib/with-rate-limit";
import { itemResponse, errorResponse } from "@/lib/envelope";

// GET /api/v1/categories/:id -- a malformed or nonexistent id returns 404,
// never a 500 -- findUnique returning null is an expected, handled case,
// not an exception.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitOrNull(req);
  if (limited) return limited;

  const { id } = await params;
  const category = await db.category.findUnique({ where: { id } });
  if (!category) return errorResponse("NOT_FOUND", "Category not found", 404);

  return itemResponse(category);
}
