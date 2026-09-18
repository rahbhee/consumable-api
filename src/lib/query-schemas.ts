import { z } from "zod";
import { API_CONFIG } from "./api-config";

// Every rule for query-string input lives here, once -- not scattered
// through each handler as ad-hoc parsing. A limit of 5000 is clamped (not
// honoured) by .max() below; a negative offset is rejected outright by
// .nonnegative(); an out-of-enum sort value is rejected by z.enum(), never
// silently ignored.
const limitSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(API_CONFIG.pagination.maxLimit)
  .default(API_CONFIG.pagination.defaultLimit);

const orderSchema = z.enum(["asc", "desc"]).default("desc");

export const productsQuerySchema = z.object({
  limit: limitSchema,
  cursor: z.string().optional(),
  category: z.string().optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  sort: z.enum(["price", "name", "createdAt"]).default("createdAt"),
  order: orderSchema,
});

export const ordersQuerySchema = z.object({
  limit: limitSchema,
  cursor: z.string().optional(),
  status: z.enum(["pending", "paid", "shipped", "cancelled"]).optional(),
  sort: z.enum(["createdAt", "totalMinorUnits"]).default("createdAt"),
  order: orderSchema,
});

export const categoriesQuerySchema = z.object({
  limit: limitSchema,
  cursor: z.string().optional(),
  sort: z.enum(["name", "createdAt"]).default("createdAt"),
  order: orderSchema,
});

export const createOrderSchema = z.object({
  customerName: z.string().trim().min(1, "customerName is required"),
  customerEmail: z.string().trim().email("customerEmail must be a valid email"),
  items: z
    .array(
      z.object({
        productId: z.string().uuid("productId must be a valid id"),
        quantity: z.coerce.number().int().positive("quantity must be a positive integer"),
      })
    )
    .min(1, "items must contain at least one item"),
});

export const updateOrderSchema = z.object({
  status: z.enum(["pending", "paid", "shipped", "cancelled"]).optional(),
});
