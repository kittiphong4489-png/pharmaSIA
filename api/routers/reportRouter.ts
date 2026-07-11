/**
 * ============================================================
 * api/routers/reportRouter.ts — Report API (SQL)
 * ============================================================
 */

import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";

export const reportRouter = createRouter({
  dashboard: publicQuery.query(async () => {
    const db = getDb();

    const totalProducts = (db.prepare("SELECT COUNT(*) as count FROM products").get() as any).count;
    const totalCategories = (db.prepare("SELECT COUNT(*) as count FROM categories").get() as any).count;
    const activeOrders = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(grandTotal),0) as revenue FROM orders WHERE status != 'cancelled'").get() as any;
    const todayRevenue = (db.prepare("SELECT COALESCE(SUM(grandTotal),0) as revenue FROM orders WHERE status != 'cancelled' AND orderedAt >= date('now')").get() as any).revenue;
    const pendingOrders = (db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'").get() as any).count;
    const lowStockProducts = (db.prepare("SELECT COUNT(*) as count FROM products WHERE stock <= 10").get() as any).count;
    const totalUsers = (db.prepare("SELECT COUNT(*) as count FROM users").get() as any).count;

    return {
      totalProducts,
      totalCategories,
      totalOrders: activeOrders.count,
      totalRevenue: activeOrders.revenue,
      todayRevenue,
      pendingOrders,
      lowStockProducts,
      totalUsers,
    };
  }),

  sales: publicQuery
    .input(z.object({ period: z.enum(["daily", "weekly", "monthly", "yearly"]).default("daily") }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const period = input?.period ?? "daily";

      let dateFormat: string;
      if (period === "daily") dateFormat = "%Y-%m-%d";
      else if (period === "weekly") dateFormat = "%Y-%W"; // ISO week
      else if (period === "monthly") dateFormat = "%Y-%m";
      else dateFormat = "%Y"; // yearly

      const rows = db.prepare(`
        SELECT strftime(?, orderedAt) as date,
               COUNT(*) as orders,
               COALESCE(SUM(grandTotal),0) as revenue
        FROM orders
        WHERE status != 'cancelled'
        GROUP BY strftime(?, orderedAt)
        ORDER BY date ASC
      `).all(dateFormat, dateFormat) as any[];

      return rows.map((r) => ({
        date: r.date,
        orders: r.orders,
        revenue: r.revenue,
      }));
    }),

  products: publicQuery.query(async () => {
    const db = getDb();

    const topSelling = db.prepare(`
      SELECT p.*, COALESCE(SUM(oi.quantity),0) as totalSold
      FROM products p
      LEFT JOIN order_items oi ON oi.productId = p.id
      LEFT JOIN orders o ON oi.orderId = o.id AND o.status != 'cancelled'
      GROUP BY p.id
      ORDER BY totalSold DESC
      LIMIT 10
    `).all() as any[];

    const lowStock = db.prepare(`
      SELECT * FROM products
      WHERE stock <= 10 AND stock > 0
      ORDER BY stock ASC
    `).all() as any[];

    const outOfStock = db.prepare(`
      SELECT * FROM products
      WHERE stock = 0
    `).all() as any[];

    return {
      topSelling,
      lowStock,
      outOfStock,
    };
  }),
});
