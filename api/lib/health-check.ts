/**
 * api/lib/health-check.ts — Data Health Check System
 * 
 * ตรวจสอบ Data Consistency และบันทึกผลลง audit_log
 */
import { getDb } from "../queries/connection";

export interface HealthCheckResult {
  status: "healthy" | "issues_found" | "error";
  checks: HealthCheck[];
  summary: string;
  timestamp: string;
}

interface HealthCheck {
  name: string;
  passed: boolean;
  count: number;
  details: string;
  severity: "low" | "medium" | "high";
}

export function runHealthCheck(): HealthCheckResult {
  const db = getDb();
  const checks: HealthCheck[] = [];
  const timestamp = new Date().toISOString();

  try {
    // ── Check 1: Ghost Orders ──
    const ghostOrders = db.prepare(`
      SELECT COUNT(*) as count FROM orders o
      WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.orderId = o.id)
    `).get() as any;
    checks.push({
      name: "Ghost Orders (orders ไม่มี items)",
      passed: ghostOrders.count === 0,
      count: ghostOrders.count,
      details: ghostOrders.count > 0
        ? `พบ ${ghostOrders.count} ออเดอร์ที่ไม่มี order_items`
        : "ไม่มีออเดอร์ผี",
      severity: ghostOrders.count > 0 ? "high" : "low",
    });

    // ── Check 2: Stock Mismatch ──
    const stockMismatch = db.prepare(`
      SELECT COUNT(*) as count FROM products p
      WHERE (SELECT COALESCE(SUM(quantity), 0) FROM stock_batches WHERE productId = p.id AND status = 'active')
      != p.stock
    `).get() as any;
    checks.push({
      name: "Stock Mismatch (สินค้าไม่ตรง batches)",
      passed: stockMismatch.count === 0,
      count: stockMismatch.count,
      details: stockMismatch.count > 0
        ? `พบ ${stockMismatch.count} SKU ที่ stock products != stock_batches`
        : "สต็อกตรงกันทั้งหมด",
      severity: stockMismatch.count > 0 ? "high" : "low",
    });

    // ── Check 3: Invalid Session IDs in cart ──
    const invalidSessions = db.prepare(`
      SELECT COUNT(*) as count FROM cart_items
      WHERE sessionId NOT LIKE 'sess-%' AND sessionId != 'default'
    `).get() as any;
    checks.push({
      name: "Invalid Session ID ในตะกร้า",
      passed: invalidSessions.count === 0,
      count: invalidSessions.count,
      details: invalidSessions.count > 0
        ? `พบ ${invalidSessions.count} cart_items ที่ sessionId ผิดรูปแบบ (อาจเป็น JWT)`
        : "sessionId ถูกต้องทั้งหมด",
      severity: invalidSessions.count > 0 ? "medium" : "low",
    });

    // ── Check 4: Orders with invalid status ──
    const validStatuses = ["pending", "paid", "confirmed", "packing", "packed", "shipping", "cancelled"];
    const invalidStatus = db.prepare(`
      SELECT COUNT(*) as count, status FROM orders
      GROUP BY status
    `).all() as any[];
    const badStatuses = invalidStatus.filter((s: any) => !validStatuses.includes(s.status));
    checks.push({
      name: "สถานะออเดอร์ผิดปกติ",
      passed: badStatuses.length === 0,
      count: badStatuses.reduce((sum: number, s: any) => sum + s.count, 0),
      details: badStatuses.length > 0
        ? `พบสถานะไม่ถูกต้อง: ${badStatuses.map((s: any) => `${s.status}=${s.count}`).join(", ")}`
        : "สถานะออเดอร์ถูกต้องทั้งหมด",
      severity: badStatuses.length > 0 ? "high" : "low",
    });

    // ── Check 5: Expired batches ──
    const expiredBatches = db.prepare(`
      SELECT COUNT(*) as count FROM stock_batches
      WHERE expiryDate < date('now') AND status = 'active' AND quantity > 0
    `).get() as any;
    checks.push({
      name: "Batch ที่หมดอายุ (ยัง active)",
      passed: expiredBatches.count === 0,
      count: expiredBatches.count,
      details: expiredBatches.count > 0
        ? `พบ ${expiredBatches.count} batches ที่หมดอายุแต่ยัง active`
        : "ไม่มี batch ที่หมดอายุ",
      severity: expiredBatches.count > 0 ? "high" : "low",
    });

    // ── Check 6: Payments without orders ──
    const orphanPayments = db.prepare(`
      SELECT COUNT(*) as count FROM payments p
      WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = p.orderId)
    `).get() as any;
    checks.push({
      name: "Payments ไม่มีออเดอร์",
      passed: orphanPayments.count === 0,
      count: orphanPayments.count,
      details: orphanPayments.count > 0
        ? `พบ ${orphanPayments.count} payments ที่ไม่มี orders`
        : "payments ทั้งหมดมีออเดอร์",
      severity: orphanPayments.count > 0 ? "medium" : "low",
    });

    // Calculate overall status
    const failed = checks.filter(c => !c.passed);
    const status = failed.length === 0 ? "healthy" : "issues_found";

    // Log to audit_log
    const issueSummary = failed.map(c => `${c.name}: ${c.details}`).join("; ");
    try {
      db.prepare(`INSERT INTO audit_log (userId, action, entityType, entityId, details, createdAt)
        VALUES (1, 'health_check', 'system', null, ?, datetime('now'))`)
        .run(`Health Check: ${status} — ${failed.length} issues. ${issueSummary}`);
    } catch {}

    return {
      status,
      checks,
      summary: failed.length === 0
        ? "✅ ระบบสมบูรณ์ ไม่พบความผิดปกติ"
        : `⚠️ พบ ${failed.length} รายการที่ต้องตรวจสอบ`,
      timestamp,
    };
  } catch (e: any) {
    return {
      status: "error",
      checks: [],
      summary: `❌ Health Check ล้มเหลว: ${e?.message}`,
      timestamp,
    };
  }
}
