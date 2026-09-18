import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { rateLimitOrNull } from "@/lib/with-rate-limit";
import { itemResponse, errorResponse } from "@/lib/envelope";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitOrNull(req);
  if (limited) return limited;

  const { id } = await params;
  const product = await db.product.findUnique({ where: { id }, include: { category: true } });
  if (!product) return errorResponse("NOT_FOUND", "Product not found", 404);

  return itemResponse(product);
}
