/**
 * ============================================================
 * api/router.ts — tRPC App Router (Task 13.3)
 * ============================================================
 * รวม Routers ทั้งหมดเข้าด้วยกันเป็น appRouter:
 *   product   — จัดการสินค้า (list, byId, create, update, delete)
 *   category  — จัดการหมวดหมู่ (list, byId, bySlug)
 *   cart      — จัดการตะกร้า (list, add, update, remove, clear, count)
 *   user      — จัดการผู้ใช้ + B2B verification
 *   order     — จัดการออเดอร์ + รายการสินค้า + สถิติ
 * ============================================================
 */

import { createRouter, publicQuery } from "./middleware";

// TEST: if deploy uses latest code, this should crash ping
// throw new Error("ROUTER_INIT_TEST_v3");

import { categoryRouter } from "./routers/categoryRouter";
import { cartRouter } from "./routers/cartRouter";
import { productRouter } from "./routers/productRouter";
import { userRouter } from "./routers/userRouter";
import { orderRouter } from "./routers/orderRouter";
import { reportRouter } from "./routers/reportRouter";
import { inventoryRouter } from "./routers/inventoryRouter";
import { prescriptionRouter } from "./routers/prescriptionRouter";
import { forteProxyRouter } from "./routers/forteProxyRouter";
import { forteSyncRouter } from "./lib/forteSyncEngine";
import { storeRouter } from "./routers/storeRouter";
import { securityRouter } from "./routers/securityRouter";
import { authRouter } from "./routers/authRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  category: categoryRouter,
  cart: cartRouter,
  product: productRouter,
  user: userRouter,
  order: orderRouter,
  report: reportRouter,
  inventory: inventoryRouter,
  prescription: prescriptionRouter,
  forteProxy: forteProxyRouter,
  forteSync: forteSyncRouter,
  store: storeRouter,
  security: securityRouter,
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
