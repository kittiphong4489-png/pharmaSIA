import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";

export const productRouter = createRouter({
  list: publicQuery
    .input(z.object({
      categoryId: z.number().optional(),
      search: z.string().optional(),
      sort: z.enum(["popular", "price_asc", "price_desc", "newest", "discount"]).optional(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      let sql = "SELECT * FROM products WHERE 1=1";
      const params: any[] = [];
      if (input?.categoryId) { sql += " AND categoryId = ?"; params.push(input.categoryId); }
      if (input?.search) { sql += " AND (nameTh LIKE ? OR nameEn LIKE ?)"; const q = `%${input.search}%`; params.push(q, q); }
      const sortMap: Record<string, string> = { popular: "soldCount DESC", price_asc: "price ASC", price_desc: "price DESC", newest: "createdAt DESC", discount: "originalPrice IS NOT NULL AND originalPrice > price DESC" };
      if (input?.sort && sortMap[input.sort]) sql += ` ORDER BY ${sortMap[input.sort]}`;
      else sql += " ORDER BY id DESC";
      const countSql = sql.replace("SELECT *", "SELECT COUNT(*) as total");
      const { total } = db.prepare(countSql).get(...params) as any;
      const offset = ((input?.page ?? 1) - 1) * (input?.limit ?? 20);
      sql += ` LIMIT ? OFFSET ?`;
      params.push(input?.limit ?? 20, offset);
      const items = db.prepare(sql).all(...params);
      return { items, total, page: input?.page ?? 1, totalPages: Math.ceil(total / (input?.limit ?? 20)) };
    }),

  byId: publicQuery.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = getDb();
    return db.prepare("SELECT * FROM products WHERE id = ?").get(input.id) || null;
  }),

  bySlug: publicQuery.input(z.object({ slug: z.string() })).query(async ({ input }) => {
    const db = getDb();
    return db.prepare("SELECT * FROM products WHERE sku = ?").get(input.slug) || null;
  }),

  featured: publicQuery.query(async () => {
    const db = getDb();
    return db.prepare("SELECT * FROM products WHERE isFeatured = 1 LIMIT 10").all();
  }),

  newArrivals: publicQuery.query(async () => {
    const db = getDb();
    return db.prepare("SELECT * FROM products ORDER BY createdAt DESC LIMIT 10").all();
  }),
});
