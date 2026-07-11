import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";

export const categoryRouter = createRouter({
  list: publicQuery.query(() => {
    const db = getDb();
    return db.prepare("SELECT * FROM categories WHERE isActive = 1 ORDER BY sortOrder").all();
  }),
  byId: publicQuery.input(z.object({ id: z.number() })).query(({ input }) => {
    const db = getDb();
    return db.prepare("SELECT * FROM categories WHERE id = ?").get(input.id) || null;
  }),
  bySlug: publicQuery.input(z.object({ slug: z.string() })).query(({ input }) => {
    const db = getDb();
    return db.prepare("SELECT * FROM categories WHERE slug = ?").get(input.slug) || null;
  }),
});
