/**
 * api/routers/authRouter.ts — Register, Login, OAuth, Profile
 */
import { z } from "zod";
import { createRouter, publicMutation, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { hashPassword, verifyPassword, createToken, verifyToken } from "../lib/auth";
import { ensureCustomerCode } from "../queries/connection";

export const authRouter = createRouter({
  // ── Register ──
  register: publicMutation
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(6).max(100),
      fullName: z.string().min(1).max(100),
      phone: z.string().optional(),
      tier: z.enum(["INDIVIDUAL", "RETAIL_STORE"]).default("INDIVIDUAL"),
      taxId: z.string().optional(),
      address: z.string().optional(),
      ownerName: z.string().optional(),
      storePhone: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(input.email) as any;
      if (existing) return { success: false, error: "อีเมลนี้ถูกใช้แล้ว" };

      const passwordHash = hashPassword(input.password);
      const tier = input.tier || "INDIVIDUAL";
      const result = db.prepare(
        "INSERT INTO users (fullName, email, phone, role, tier, taxId, address, password, passwordHash, rawPassword, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
      ).run(input.fullName, input.email, input.phone || null, "INDIVIDUAL", tier, input.taxId || null, input.address || null, passwordHash, passwordHash, input.password);

      const token = await createToken({
        userId: result.lastInsertRowid as number,
        email: input.email,
        role: "INDIVIDUAL",
        tier: "INDIVIDUAL",
      });

      // Auto-generate customer code
      try { await ensureCustomerCode(result.lastInsertRowid as number); } catch {}

      return {
        success: true,
        token,
        user: {
          id: result.lastInsertRowid,
          fullName: input.fullName,
          email: input.email,
          role: "INDIVIDUAL",
          tier: "INDIVIDUAL",
        },
      };
    }),

  // ── Login ──
  login: publicMutation
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const user = db.prepare("SELECT id, fullName, email, phone, role, tier, passwordHash FROM users WHERE email = ? AND isActive = 1").get(input.email) as any;
      if (!user) return { success: false, error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
      if (!user.passwordHash) return { success: false, error: "บัญชีนี้ใช้ OAuth กรุณาเข้าสู่ระบบด้วย Google หรือ LINE" };

      const valid = verifyPassword(input.password, user.passwordHash);
      if (!valid) return { success: false, error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };

      const token = await createToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        tier: user.tier,
      });

      // Auto-generate customer code on login (idempotent)
      try { await ensureCustomerCode(user.id); } catch {}

      return {
        success: true,
        token,
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          tier: user.tier,
        },
      };
    }),

  // ── OAuth Login (Google / LINE) ──
  oauthLogin: publicMutation
    .input(z.object({
      provider: z.enum(["google", "line"]),
      oauthId: z.string().min(1),
      email: z.string().email(),
      fullName: z.string().min(1),
      avatarUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      // Find existing user by OAuth ID or email
      let user = db.prepare("SELECT id, fullName, email, role, tier FROM users WHERE oauthProvider = ? AND oauthId = ?").get(input.provider, input.oauthId) as any;
      if (!user) {
        user = db.prepare("SELECT id, fullName, email, role, tier FROM users WHERE email = ?").get(input.email) as any;
      }

      if (user) {
        // Update OAuth info and login
        db.prepare("UPDATE users SET oauthProvider = ?, oauthId = ?, avatarUrl = COALESCE(?, avatarUrl), updatedAt = datetime('now') WHERE id = ?")
          .run(input.provider, input.oauthId, input.avatarUrl || null, user.id);
      } else {
        // Create new user
        const result = db.prepare(
          "INSERT INTO users (fullName, email, role, tier, oauthProvider, oauthId, avatarUrl, createdAt, updatedAt) VALUES (?, ?, 'INDIVIDUAL', 'INDIVIDUAL', ?, ?, ?, datetime('now'), datetime('now'))"
        ).run(input.fullName, input.email, input.provider, input.oauthId, input.avatarUrl || null);
        user = { id: result.lastInsertRowid, fullName: input.fullName, email: input.email, role: "INDIVIDUAL", tier: "INDIVIDUAL" };
      }

      const token = await createToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        tier: user.tier,
      });

      return { success: true, token, user };
    }),

  // ── Verify token & get profile ──
  me: publicMutation
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const payload = await verifyToken(input.token);
      if (!payload) return { success: false, error: "Token ไม่ถูกต้องหรือหมดอายุ" };

      const db = getDb();
      const user = db.prepare("SELECT id, fullName, email, phone, role, tier, createdAt FROM users WHERE id = ?").get(payload.userId) as any;
      if (!user) return { success: false, error: "ไม่พบผู้ใช้" };

      return { success: true, user };
    }),
});
