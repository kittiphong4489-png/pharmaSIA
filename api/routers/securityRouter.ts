/**
 * ============================================================
 * api/routers/securityRouter.ts — Security & Anomaly Detection
 * ============================================================
 * - Audit Log (บันทึกทุกการกระทำ)
 * - Anomaly Detection (จับความผิดปกติ)
 * - Rate Limiting tracking
 * - Security Alerts (ส่งอีเมล)
 * ============================================================
 */

import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";

// ── Audit Log Type ──
export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;        // LOGIN, LOGOUT, SYNC, ORDER, PRESCRIPTION, etc.
  userId: string | null;
  username: string | null;
  ip: string;
  userAgent: string;
  details: string;
  severity: "info" | "warning" | "critical";
  resolved: boolean;
}

// ── Anomaly Alert Type ──
export interface AnomalyAlert {
  id: string;
  timestamp: string;
  type: string;          // brute_force, abnormal_order, unusual_sync, new_device
  description: string;
  sourceIp: string;
  userId: string | null;
  severity: "warning" | "critical";
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

// ── Rate Limit Record ──
interface RateLimitRecord {
  key: string;           // ip:action
  count: number;
  windowStart: number;   // timestamp
  blocked: boolean;
  blockedUntil: number;
}

// ── In-memory storage ──
const auditLogs: AuditLog[] = [];
const anomalyAlerts: AnomalyAlert[] = [];
const rateLimits: Map<string, RateLimitRecord> = new Map();

// ── Rate Limit Config ──
const RATE_LIMITS: Record<string, { max: number; windowMs: number; blockMs: number }> = {
  login: { max: 5, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 },      // 5 ครั้ง/15 นาที
  sync: { max: 10, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 },      // 10 ครั้ง/ชั่วโมง
  api: { max: 100, windowMs: 60 * 1000, blockMs: 5 * 60 * 1000 },            // 100 ครั้ง/นาที
  order: { max: 20, windowMs: 60 * 1000, blockMs: 10 * 60 * 1000 },          // 20 ครั้ง/นาที
  chat: { max: 50, windowMs: 60 * 1000, blockMs: 5 * 60 * 1000 },            // 50 ข้อความ/นาที
};

// ── Helper: Check rate limit ──
function checkRateLimit(key: string, action: string): { allowed: boolean; remaining: number; blocked: boolean } {
  const config = RATE_LIMITS[action] || RATE_LIMITS.api;
  const now = Date.now();
  const record = rateLimits.get(key);

  if (!record) {
    rateLimits.set(key, { key, count: 1, windowStart: now, blocked: false, blockedUntil: 0 });
    return { allowed: true, remaining: config.max - 1, blocked: false };
  }

  // Reset if window passed
  if (now - record.windowStart > config.windowMs) {
    record.count = 1;
    record.windowStart = now;
    record.blocked = false;
    record.blockedUntil = 0;
    return { allowed: true, remaining: config.max - 1, blocked: false };
  }

  // Check if still blocked
  if (record.blocked && now < record.blockedUntil) {
    return { allowed: false, remaining: 0, blocked: true };
  }

  // Check limit
  if (record.count >= config.max) {
    record.blocked = true;
    record.blockedUntil = now + config.blockMs;
    return { allowed: false, remaining: 0, blocked: true };
  }

  record.count++;
  return { allowed: true, remaining: config.max - record.count, blocked: false };
}

// ── Helper: Add audit log ──
function addAuditLog(log: Omit<AuditLog, "id" | "timestamp">): AuditLog {
  const entry: AuditLog = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...log,
  };
  auditLogs.unshift(entry);
  if (auditLogs.length > 1000) auditLogs.pop(); // Keep last 1000
  return entry;
}

// ── Helper: Detect anomaly ──
function detectAnomaly(action: string, ip: string, userId: string | null, details: string): AnomalyAlert | null {
  let alert: AnomalyAlert | null = null;

  // Brute force detection
  if (action === "LOGIN_FAILED") {
    const recentFails = auditLogs.filter(
      (l) => l.action === "LOGIN_FAILED" && l.ip === ip && Date.now() - new Date(l.timestamp).getTime() < 15 * 60 * 1000
    );
    if (recentFails.length >= 5) {
      alert = {
        id: `alert-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: "brute_force",
        description: `พบการพยายาม login ผิด ${recentFails.length} ครั้งจาก IP ${ip}`,
        sourceIp: ip,
        userId,
        severity: "critical",
        acknowledged: false,
        acknowledgedAt: null,
        acknowledgedBy: null,
      };
    }
  }

  // Abnormal sync
  if (action === "FORTE_SYNC") {
    const recentSyncs = auditLogs.filter(
      (l) => l.action === "FORTE_SYNC" && Date.now() - new Date(l.timestamp).getTime() < 60 * 60 * 1000
    );
    if (recentSyncs.length >= 10) {
      alert = {
        id: `alert-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: "unusual_sync",
        description: `ดึงข้อมูล Forte บ่อยเกินไป: ${recentSyncs.length} ครั้ง/ชั่วโมง`,
        sourceIp: ip,
        userId,
        severity: "warning",
        acknowledged: false,
        acknowledgedAt: null,
        acknowledgedBy: null,
      };
    }
  }

  if (alert) {
    anomalyAlerts.unshift(alert);
    if (anomalyAlerts.length > 100) anomalyAlerts.pop();
  }
  return alert;
}

// ── tRPC Router ──
export const securityRouter = createRouter({
  // ── Log an action ──
  log: publicQuery
    .input(z.object({
      action: z.string().min(1),
      userId: z.string().nullable().optional(),
      username: z.string().nullable().optional(),
      ip: z.string().default("unknown"),
      userAgent: z.string().default(""),
      details: z.string().default(""),
      severity: z.enum(["info", "warning", "critical"]).default("info"),
    }))
    .mutation(async ({ input }) => {
      const log = addAuditLog({
        action: input.action,
        ip: input.ip,
        userAgent: input.userAgent,
        details: input.details,
        severity: input.severity,
        resolved: false,
        userId: input.userId ?? null,
        username: input.username ?? null,
      });
      const anomaly = detectAnomaly(input.action, input.ip, input.userId ?? null, input.details);
      return { log, anomaly };
    }),

  // ── Check rate limit ──
  rateLimit: publicQuery
    .input(z.object({
      key: z.string().min(1),     // e.g., "192.168.1.1:login"
      action: z.string().min(1),  // login, sync, api, order, chat
    }))
    .query(async ({ input }) => {
      return checkRateLimit(input.key, input.action);
    }),

  // ── Get audit logs (admin) ──
  auditLogs: publicQuery
    .input(z.object({
      action: z.string().optional(),
      severity: z.string().optional(),
      limit: z.number().min(1).max(500).default(100),
      page: z.number().min(1).default(1),
    }).optional())
    .query(async ({ input }) => {
      let logs = [...auditLogs];
      if (input?.action) logs = logs.filter((l) => l.action === input.action);
      if (input?.severity) logs = logs.filter((l) => l.severity === input.severity);
      const total = logs.length;
      const paginated = logs.slice((input?.page ?? 1 - 1) * (input?.limit ?? 100), (input?.page ?? 1) * (input?.limit ?? 100));
      return { logs: paginated, total };
    }),

  // ── Get anomaly alerts (admin) ──
  alerts: publicQuery
    .input(z.object({
      acknowledged: z.boolean().optional(),
      severity: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
    }).optional())
    .query(async ({ input }) => {
      let alerts = [...anomalyAlerts];
      if (input?.acknowledged !== undefined) alerts = alerts.filter((a) => a.acknowledged === input.acknowledged);
      if (input?.severity) alerts = alerts.filter((a) => a.severity === input.severity);
      return alerts.slice(0, input?.limit ?? 50);
    }),

  // ── Acknowledge alert (admin) ──
  acknowledgeAlert: publicQuery
    .input(z.object({ id: z.string(), by: z.string() }))
    .mutation(async ({ input }) => {
      const alert = anomalyAlerts.find((a) => a.id === input.id);
      if (alert) {
        alert.acknowledged = true;
        alert.acknowledgedAt = new Date().toISOString();
        alert.acknowledgedBy = input.by;
      }
      return alert ?? null;
    }),

  // ── Get security stats ──
  stats: publicQuery.query(async () => {
    const now = Date.now();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return {
      totalLogs: auditLogs.length,
      todayLogs: auditLogs.filter((l) => new Date(l.timestamp) >= today).length,
      totalAlerts: anomalyAlerts.length,
      pendingAlerts: anomalyAlerts.filter((a) => !a.acknowledged).length,
      criticalAlerts: anomalyAlerts.filter((a) => a.severity === "critical" && !a.acknowledged).length,
      activeBlocks: Array.from(rateLimits.values()).filter((r) => r.blocked && now < r.blockedUntil).length,
    };
  }),
});
