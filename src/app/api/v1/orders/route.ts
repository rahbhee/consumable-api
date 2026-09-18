import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { rateLimitOrNull } from "@/lib/with-rate-limit";
import { dataResponse, itemResponse, errorResponse } from "@/lib/envelope";
import { ordersQuerySchema, createOrderSchema } from "@/lib/query-schemas";
import { encodeCursor, decodeCursor, buildCursorWhere } from "@/lib/pagination";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const limited = await rateLimitOrNull(req);
  if (limited) return limited;

  const parsed = ordersQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid query", 400);
  }
  const { limit, cursor, status, sort, order } = parsed.data;

  const filters: Prisma.OrderWhereInput = status ? { status } : {};
  let where: Prisma.OrderWhereInput = filters;
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (!decoded) return errorResponse("BAD_REQUEST", "Invalid cursor", 400);
    where = { AND: [filters, buildCursorWhere(sort, order, decoded) as Prisma.OrderWhereInput] };
  }

  const [total, rows] = await Promise.all([
    db.order.count({ where: filters }),
    db.order.findMany({ where, orderBy: [{ [sort]: order }, { id: order }], take: limit + 1 }),
  ]);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor((last as unknown as Record<string, string>)[sort], last.id) : null;

  return dataResponse(page, { total, limit, hasMore, nextCursor });
}

// POST /api/v1/orders -- creates an order from a list of {productId,
// quantity}. Prices are snapshotted from the product's CURRENT price at
// creation time and stored on each order item, not looked up again later.
export async function POST(req: NextRequest) {
  const limited = await rateLimitOrNull(req);
  if (limited) return limited;

  const parsed = createOrderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return errorResponse("VALIDATION_ERROR", issue?.message ?? "Invalid input", 422, {
      field: issue?.path.join("."),
    });
  }
  const { customerName, customerEmail, items } = parsed.data;

  const productIds = items.map((i) => i.productId);
  const products = await db.product.findMany({ where: { id: { in: productIds } } });
  const productMap = new Map(products.map((p) => [p.id, p]));

  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) {
      return errorResponse("VALIDATION_ERROR", `Product ${item.productId} does not exist`, 422, {
        field: "items.productId",
      });
    }
    if (product.stockQuantity < item.quantity) {
      return errorResponse("VALIDATION_ERROR", `Insufficient stock for product ${item.productId}`, 422, {
        field: "items.quantity",
      });
    }
  }

  const totalMinorUnits = items.reduce((sum, item) => {
    const product = productMap.get(item.productId)!;
    return sum + product.priceMinorUnits * item.quantity;
  }, 0);

  const order = await db.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        customerName,
        customerEmail,
        totalMinorUnits,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPriceMinorUnits: productMap.get(item.productId)!.priceMinorUnits,
          })),
        },
      },
      include: { items: true },
    });

    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stockQuantity: { decrement: item.quantity } },
      });
    }

    return created;
  });

  return itemResponse(order, 201);
}
