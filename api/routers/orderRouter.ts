/**
 * ============================================================
 * api/routers/orderRouter.ts — Order API (In-Memory)
 * ============================================================
 */

import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";

function generateOrderNumber(seq: number): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `ORD-${dateStr}-${String(seq).padStart(3, "0")}`;
}

export const orderRouter = createRouter({
  list: publicQuery
    .input(
      z.object({
        status: z.enum(["pending", "confirmed", "processing", "shipped", "delivered", "completed", "cancelled"]).optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = getDb();
      let items = [...db.orders].sort((a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime());
      if (input?.status) items = items.filter((o) => o.status === input.status);

      const stats = {
        total: db.orders.length,
        pending: db.orders.filter((o) => o.status === "pending").length,
        processing: db.orders.filter((o) => o.status === "processing").length,
        shipped: db.orders.filter((o) => o.status === "shipped").length,
        delivered: db.orders.filter((o) => o.status === "delivered").length,
        completed: db.orders.filter((o) => o.status === "completed").length,
        cancelled: db.orders.filter((o) => o.status === "cancelled").length,
        totalRevenue: db.orders.filter((o) => o.status !== "cancelled").reduce((sum, o) => sum + (o.grandTotal ?? 0), 0),
      };

      const total = items.length;
      const paginated = items.slice(((input?.page ?? 1) - 1) * (input?.limit ?? 20), (input?.page ?? 1) * (input?.limit ?? 20));
      return { items: paginated, total, page: input?.page ?? 1, totalPages: Math.ceil(total / (input?.limit ?? 20)), stats };
    }),

  byId: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const order = db.orders.find((o) => o.id === input.id);
      if (!order) return null;
      const items = db.orderItems.filter((i) => i.orderId === input.id);
      return { ...order, items };
    }),

  create: publicQuery
    .input(
      z.object({
        customerName: z.string().min(1),
        customerPhone: z.string().optional(),
        shippingAddressJson: z.string().optional(),
        customerTier: z.enum(["INDIVIDUAL", "RETAIL", "CLINIC"]).default("INDIVIDUAL"),
        subtotal: z.number().default(0),
        shippingFee: z.number().default(0),
        grandTotal: z.number(),
        notes: z.string().optional(),
        items: z.array(z.object({
          productId: z.number(),
          productNameTh: z.string(),
          productNameEn: z.string(),
          unitPrice: z.number(),
          quantity: z.number().min(1),
          subtotal: z.number(),
        })).min(1),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const id = db.genId();
      const orderNumber = generateOrderNumber(db.orders.length + 1);

      db.orders.push({
        id,
        orderNumber,
        customerName: input.customerName,
        customerPhone: input.customerPhone ?? null,
        shippingAddressJson: input.shippingAddressJson ?? null,
        customerTier: input.customerTier,
        subtotal: input.subtotal,
        shippingFee: input.shippingFee,
        grandTotal: input.grandTotal,
        status: "pending",
        notes: input.notes ?? null,
        orderedAt: new Date(),
        updatedAt: new Date(),
      });

      for (const item of input.items) {
        db.orderItems.push({
          id: db.genId(),
          orderId: id,
          productId: item.productId,
          productNameTh: item.productNameTh,
          productNameEn: item.productNameEn,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          subtotal: item.subtotal,
          createdAt: new Date(),
        });
      }

      return db.orders.find((o) => o.id === id)!;
    }),

  updateStatus: publicQuery
    .input(z.object({ id: z.number(), status: z.enum(["pending", "confirmed", "processing", "shipped", "delivered", "completed", "cancelled"]) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const order = db.orders.find((o) => o.id === input.id);
      if (order) order.status = input.status;
      return order ?? null;
    }),

  delete: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      db.orderItems = db.orderItems.filter((i) => i.orderId !== input.id);
      db.orders = db.orders.filter((o) => o.id !== input.id);
      return { success: true };
    }),

  stats: publicQuery.query(async () => {
    const db = getDb();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return {
      total: db.orders.length,
      pending: db.orders.filter((o) => o.status === "pending").length,
      totalRevenue: db.orders.filter((o) => o.status !== "cancelled").reduce((sum, o) => sum + (o.grandTotal ?? 0), 0),
      todayOrders: db.orders.filter((o) => o.orderedAt && new Date(o.orderedAt) >= today).length,
    };
  }),
});
