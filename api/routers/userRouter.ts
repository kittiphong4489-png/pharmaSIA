/**
 * ============================================================
 * api/routers/userRouter.ts — User API (In-Memory)
 * ============================================================
 */

import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";

export const userRouter = createRouter({
  list: publicQuery
    .input(z.object({ role: z.string().optional(), search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      let items = [...db.users];
      if (input?.role) items = items.filter((u) => u.role === input.role);
      if (input?.search) {
        const q = input.search.toLowerCase();
        items = items.filter((u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
      }
      return items;
    }),

  byId: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.users.find((u) => u.id === input.id) ?? null;
    }),

  create: publicQuery
    .input(z.object({
      fullName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      role: z.string().default("customer"),
      tier: z.string().default("INDIVIDUAL"),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const id = db.genId();
      db.users.push({ id, ...input, isActive: true, verificationStatus: "NONE", createdAt: new Date(), updatedAt: new Date() } as any);
      return db.users.find((u) => u.id === id)!;
    }),

  update: publicQuery
    .input(z.object({ id: z.number(), fullName: z.string().optional(), phone: z.string().optional(), tier: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const user = db.users.find((u) => u.id === input.id);
      if (!user) return null;
      if (input.fullName) user.fullName = input.fullName;
      if (input.phone) user.phone = input.phone;
      if (input.tier) user.tier = input.tier;
      return user;
    }),

  delete: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      db.users = db.users.filter((u) => u.id !== input.id);
      return { success: true };
    }),

  stats: publicQuery.query(async () => {
    const db = getDb();
    return {
      total: db.users.length,
      customers: db.users.filter((u) => u.role === "customer").length,
      sellers: db.users.filter((u) => u.role === "seller").length,
      admins: db.users.filter((u) => u.role === "admin").length,
    };
  }),
});
