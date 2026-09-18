import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { rateLimitOrNull } from "@/lib/with-rate-limit";
import { itemResponse, errorResponse } from "@/lib/envelope";
import { updateOrderSchema } from "@/lib/query-schemas";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitOrNull(req);
  if (limited) return limited;

  const { id } = await params;
  const order = await db.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) return errorResponse("NOT_FOUND", "Order not found", 404);

  return itemResponse(order);
}

// PATCH -- partial update, currently just status. A real workflow would
// also validate the transition (e.g. cancelled -> shipped should be
// rejected) -- noted as a real gap in DOCUMENTATION.md/README rather than
// silently allowed and left undocumented.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitOrNull(req);
  if (limited) return limited;

  const { id } = await params;
  const existing = await db.order.findUnique({ where: { id } });
  if (!existing) return errorResponse("NOT_FOUND", "Order not found", 404);

  const parsed = updateOrderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid input", 422);
  }

  const updated = await db.order.update({ where: { id }, data: parsed.data });
  return itemResponse(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitOrNull(req);
  if (limited) return limited;

  const { id } = await params;
  const existing = await db.order.findUnique({ where: { id } });
  if (!existing) return errorResponse("NOT_FOUND", "Order not found", 404);

  await db.order.delete({ where: { id } });
  return itemResponse({ deleted: true });
}
