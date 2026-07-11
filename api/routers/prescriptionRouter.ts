/**
 * ============================================================
 * api/routers/prescriptionRouter.ts — Prescription API (In-Memory)
 * ============================================================
 */

import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";

export const prescriptionRouter = createRouter({
  create: publicQuery
    .input(
      z.object({
        customerName: z.string().min(1),
        customerPhone: z.string().optional(),
        pharmacistName: z.string(),
        prescriptionRef: z.string().optional(),
        items: z.array(z.object({
          productNameTh: z.string(),
          productNameEn: z.string(),
          unitPrice: z.number(),
          quantity: z.number().min(1),
          subtotal: z.number(),
        })).min(1),
        subtotal: z.number(),
        grandTotal: z.number(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const id = db.genId();
      const orderNumber = `RX-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}${String(new Date().getDate()).padStart(2, "0")}-${String(Math.floor(Math.random() * 999)).padStart(3, "0")}`;

      db.orders.push({
        id,
        orderNumber,
        customerName: input.customerName,
        customerPhone: input.customerPhone ?? null,
        pharmacistName: input.pharmacistName,
        prescriptionRef: input.prescriptionRef ?? null,
        source: "pharmacist",
        subtotal: input.subtotal,
        grandTotal: input.grandTotal,
        status: "pending",
        notes: input.notes ?? null,
        orderedAt: new Date(),
        updatedAt: new Date(),
      });

      return db.orders.find((o) => o.id === id)!;
    }),

  list: publicQuery
    .input(z.object({ status: z.string().optional(), page: z.number().default(1), limit: z.number().default(20) }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      let items = [...db.orders].sort((a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime());
      items = items.filter((o) => o.source === "pharmacist");
      if (input?.status) items = items.filter((o) => o.status === input.status);

      const total = items.length;
      return { items: items.slice((input?.page ?? 1 - 1) * (input?.limit ?? 20), (input?.page ?? 1) * (input?.limit ?? 20)), total, page: input?.page ?? 1 };
    }),
});
