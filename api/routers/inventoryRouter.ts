import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";

export const inventoryRouter = createRouter({
  list: publicQuery
    .input(z.object({ categoryId: z.number().optional(), search: z.string().optional(), page: z.number().default(1), limit: z.number().default(20) }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      let sql = "SELECT * FROM products WHERE 1=1";
      const params: any[] = [];
      if (input?.categoryId) { sql += " AND categoryId = ?"; params.push(input.categoryId); }
      if (input?.search) { sql += " AND nameTh LIKE ?"; params.push(`%${input.search}%`); }
      const total = (db.prepare(sql.replace("SELECT *", "SELECT COUNT(*) as total")).get(...params) as any)?.total || 0;
      sql += " ORDER BY id DESC LIMIT ? OFFSET ?";
      params.push(input?.limit ?? 20, ((input?.page ?? 1) - 1) * (input?.limit ?? 20));
      return { items: db.prepare(sql).all(...params), total, page: input?.page ?? 1 };
    }),

  byId: publicQuery.input(z.object({ productId: z.number() })).query(async ({ input }) => {
    return getDb().prepare("SELECT * FROM products WHERE id = ?").get(input.productId) || null;
  }),

  lowStock: publicQuery.input(z.object({ threshold: z.number().default(10) }).optional()).query(async ({ input }) => {
    return getDb().prepare("SELECT * FROM products WHERE stock > 0 AND stock <= ? ORDER BY stock ASC").all(input?.threshold ?? 10);
  }),

  outOfStock: publicQuery.query(async () => {
    return getDb().prepare("SELECT * FROM products WHERE stock = 0 OR stock IS NULL").all();
  }),

  summary: publicQuery.query(async () => {
    const db = getDb();
    const totalProducts = (db.prepare("SELECT COUNT(*) as c FROM products").get() as any)?.c || 0;
    const totalStock = (db.prepare("SELECT COALESCE(SUM(stock),0) as s FROM products").get() as any)?.s || 0;
    const lowStock = (db.prepare("SELECT COUNT(*) as c FROM products WHERE stock > 0 AND stock <= 10").get() as any)?.c || 0;
    const outOfStock = (db.prepare("SELECT COUNT(*) as c FROM products WHERE stock = 0 OR stock IS NULL").get() as any)?.c || 0;
    const totalValue = (db.prepare("SELECT COALESCE(SUM(stock * price),0) as v FROM products").get() as any)?.v || 0;
    return { totalProducts, totalStock, lowStock, outOfStock, totalValue };
  }),
});
