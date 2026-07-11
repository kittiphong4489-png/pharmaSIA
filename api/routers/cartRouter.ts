import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";

export const cartRouter = createRouter({
  list: publicQuery
    .input(z.object({ sessionId: z.string() }))
    .query(({ input }) => {
      const db = getDb();
      return db.prepare(`
        SELECT ci.*, p.nameTh, p.nameEn, p.price, p.stock, p.image, p.unit
        FROM cart_items ci JOIN products p ON ci.productId = p.id
        WHERE ci.sessionId = ?`).all(input.sessionId);
    }),

  count: publicQuery
    .input(z.object({ sessionId: z.string() }))
    .query(({ input }) => {
      const db = getDb();
      const items = db.prepare("SELECT quantity FROM cart_items WHERE sessionId = ?").all(input.sessionId) as any[];
      return { count: items.reduce((sum: number, item: any) => sum + item.quantity, 0) };
    }),

  add: publicQuery
    .input(z.object({ sessionId: z.string(), productId: z.number(), quantity: z.number().default(1) }))
    .mutation(({ input }) => {
      const db = getDb();
      const existing = db.prepare("SELECT id, quantity FROM cart_items WHERE sessionId = ? AND productId = ?").get(input.sessionId, input.productId) as any;
      if (existing) {
        db.prepare("UPDATE cart_items SET quantity = quantity + ? WHERE id = ?").run(input.quantity, existing.id);
      } else {
        db.prepare("INSERT INTO cart_items (sessionId, productId, quantity, createdAt) VALUES (?, ?, ?, datetime('now'))").run(input.sessionId, input.productId, input.quantity);
      }
      return { success: true };
    }),

  update: publicQuery
    .input(z.object({ sessionId: z.string(), id: z.number(), quantity: z.number() }))
    .mutation(({ input }) => {
      const db = getDb();
      const result = db.prepare("UPDATE cart_items SET quantity = ? WHERE id = ? AND sessionId = ?").run(input.quantity, input.id, input.sessionId);
      return { success: result.changes > 0 };
    }),

  remove: publicQuery
    .input(z.object({ sessionId: z.string(), id: z.number() }))
    .mutation(({ input }) => {
      const db = getDb();
      const result = db.prepare("DELETE FROM cart_items WHERE id = ? AND sessionId = ?").run(input.id, input.sessionId);
      return { success: result.changes > 0 };
    }),
});
