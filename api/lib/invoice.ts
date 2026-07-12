/**
 * api/lib/invoice.ts — Generate PDF invoices (simple, clean, no overlap)
 */
import PDFDocument from "pdfkit";
import { getDb } from "../queries/connection";
import path from "path";
import { fileURLToPath } from "url";
import QRCode from "qrcode";

const __dirname_esm = typeof __dirname !== "undefined"
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

const FONT_DIR = path.resolve(__dirname_esm, "../api/fonts");

export async function generateInvoicePdf(orderId: number): Promise<Buffer> {
  const db = getDb();
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as any;
  if (!order) throw new Error("Order not found");

  const settingsRows = db.prepare("SELECT key, value FROM store_settings").all() as any[];
  const s: Record<string, string> = {};
  for (const row of settingsRows) s[row.key] = row.value;

  const items = db.prepare("SELECT * FROM order_items WHERE orderId = ?").all(orderId) as any[];

  let addr: any = {};
  try { addr = JSON.parse(order.shippingAddressJson || "{}"); } catch {}

  let customerUser: any = null;
  if (order.userId) {
    customerUser = db.prepare("SELECT fullName, phone, email FROM users WHERE id = ?").get(order.userId) as any;
  }

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const buffers: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));

  return new Promise(async (resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    // Register Thai font (fallback silently)
    try { doc.registerFont("Thai", path.join(FONT_DIR, "NotoSansThai.ttf")); } catch {}
    try { doc.registerFont("Thai-Bold", path.join(FONT_DIR, "NotoSansThai.ttf")); } catch {}
    // Also try THSarabun as fallback
    try { doc.registerFont("ThaiB", path.join(FONT_DIR, "THSarabun.ttf")); } catch {}

    const fn = (bold = false) => { try { doc.font(bold ? "Thai-Bold" : "Thai"); } catch {} };

    // ── Page dimensions ──
    const ML = 40;
    const PW = doc.page.width - 80;  // ~515
    const RE = ML + PW;              // ~555

    let y = ML;

    // ═════════════════════════════════════════════════
    //  HEADER — Left: Store | Center: QR | Right: Order
    // ═════════════════════════════════════════════════
    const QR_SIZE = 72;              // 1x1 inch
    const L_COL_W = PW * 0.38;       // left col ~38%
    const R_COL_W = PW * 0.38;       // right col ~38%
    const QR_X = ML + L_COL_W + (PW - L_COL_W - R_COL_W - QR_SIZE) / 2;  // centered between
    // ── RIGHT: Order Reference (ติดกับ QR, เว้น 1cm) ──
    const GAP_1CM = 28;              // ~1cm ≈ 28pt
    const R_RIGHT = QR_X + QR_SIZE + GAP_1CM;
    fn(true);
    doc.fontSize(16).fillColor("#2E7D32")
      .text(s.storeNameTh || s.storeName || "PharmaCare", ML, y, { width: L_COL_W });
    y += 22;

    fn();
    doc.fontSize(9).fillColor("#555");
    const sinfo = [s.storeAddress, s.storePhone ? `โทร: ${s.storePhone}` : "", s.taxId ? `เลขประจำตัวผู้เสียภาษี: ${s.taxId}` : ""].filter(Boolean);
    for (const line of sinfo) {
      doc.text(line, ML, y, { width: L_COL_W });
      y += 13;
    }

    // ── CENTER: QR Code (1x1 inch, between left & right) ──
    const refStartY = 40;
    const qrUrl = `https://pharmacare-1783398975-production.up.railway.app/scan/${orderId}`;
    try {
      const qrBuffer = await QRCode.toBuffer(qrUrl, { width: 90, margin: 1 });
      doc.image(qrBuffer, QR_X, refStartY + 5, { width: QR_SIZE, height: QR_SIZE });
      fn();
      doc.fontSize(6).fillColor("#999").text("สแกน QR", QR_X, refStartY + QR_SIZE + 6, { width: QR_SIZE, align: "center" });
    } catch {}

    // ── RIGHT: Order Reference (chิดขอบขวา) ──
    fn(true);
    doc.fontSize(12).fillColor("#111827")
      .text("ใบรายการสั่งซื้อ", R_RIGHT, refStartY, { width: R_COL_W, align: "right" });
    let ry = refStartY + 18;

    fn();
    doc.fontSize(9).fillColor("#555");
    const od = new Date(order.orderedAt || order.createdAt);
    const statusLabels: Record<string, string> = {
      pending: "รอจ่ายเงิน", paid: "จ่ายแล้ว", confirmed: "รออนุมัติ",
      packing: "กำลังแพ็ค", packed: "รอเข้ารับ", shipping: "กำลังจัดส่ง",
      cancelled: "ยกเลิก", delivered: "ส่งสำเร็จ",
    };
    const refs: [string, string][] = [
      ["เลขที่ออเดอร์:", order.orderNumber || `#${orderId}`],
      ["วันที่:", od.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })],
      ["เวลา:", od.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })],
      ["สถานะ:", statusLabels[order.status] || order.status],
    ];
    if (order.trackingNumber) refs.push(["เลขพัสดุ:", order.trackingNumber]);
    for (const [label, value] of refs) {
      doc.text(`${label} ${value}`, R_RIGHT, ry, { width: R_COL_W, align: "right" });
      ry += 14;
    }

    // Set y to max of both columns
    y = Math.max(y + 6, ry + 8);

    // ═══════════════════════════════════════════════
    //  SEPARATOR
    // ═══════════════════════════════════════════════
    y += 8;
    doc.moveTo(ML, y).lineTo(RE, y).strokeColor("#ddd").stroke();
    y += 14;

    // ═══════════════════════════════════════════════
    //  CUSTOMER INFO
    // ═══════════════════════════════════════════════
    fn(true);
    doc.fontSize(10).fillColor("#111827").text("ข้อมูลลูกค้า", ML, y);
    y += 17;

    fn();
    doc.fontSize(9).fillColor("#555");
    doc.text(`ชื่อ: ${order.customerName || customerUser?.fullName || "-"}`, ML, y); y += 14;
    doc.text(`โทร: ${order.customerPhone || customerUser?.phone || "-"}`, ML, y); y += 14;
    if (customerUser?.email) { doc.text(`อีเมล: ${customerUser.email}`, ML, y); y += 14; }
    const ap = [addr.address, addr.district, addr.province, addr.zip].filter(Boolean).join(" ");
    if (ap) { doc.text(`ที่อยู่: ${ap}`, ML, y, { width: PW }); y += 18; }

    // ═══════════════════════════════════════════════
    //  TABLE — Products
    // ═══════════════════════════════════════════════
    y += 6;
    doc.moveTo(ML, y).lineTo(RE, y).strokeColor("#ccc").stroke();
    y += 8;

    const T_NAME = ML;
    const T_QTY = RE - 200;
    const T_PRICE = RE - 135;
    const T_TOTAL = RE - 70;

    fn(true);
    doc.fontSize(9).fillColor("#2E7D32");
    doc.text("รายการสินค้า", T_NAME, y);
    doc.text("จำนวน", T_QTY, y, { width: 55, align: "right" });
    doc.text("ราคา/หน่วย", T_PRICE, y, { width: 65, align: "right" });
    doc.text("รวม", T_TOTAL, y, { width: 70, align: "right" });

    y += 16;
    doc.moveTo(ML, y).lineTo(RE, y).strokeColor("#ccc").stroke();
    y += 7;

    fn();
    doc.fontSize(9).fillColor("#444");
    for (const item of items) {
      const nm = (item.productNameTh || item.productNameEn || "สินค้า").substring(0, 70);
      doc.text(nm, T_NAME, y, { width: T_QTY - T_NAME - 8 });
      doc.text(String(item.quantity || 1), T_QTY, y, { width: 55, align: "right" });
      doc.text(`฿${Number(item.unitPrice).toFixed(2)}`, T_PRICE, y, { width: 65, align: "right" });
      doc.text(`฿${(item.subtotal || item.unitPrice * item.quantity).toFixed(2)}`, T_TOTAL, y, { width: 70, align: "right" });
      y += 17;
      if (y > 720) { doc.addPage(); y = 50; }
    }

    // ═══════════════════════════════════════════════
    //  TOTALS — Right aligned, no border
    // ═══════════════════════════════════════════════
    y += 12;
    const TL = RE - 200;
    const TV = RE - 60;
    const TW = 55;

    doc.moveTo(TL, y).lineTo(RE, y).strokeColor("#ddd").stroke();
    y += 10;

    fn();
    doc.fontSize(10).fillColor("#444");

    const trow = (label: string, value: string, bold = false) => {
      if (bold) { fn(true); doc.fontSize(14).fillColor("#2E7D32"); } else { fn(); doc.fontSize(10).fillColor("#444"); }
      doc.text(label, TL, y);
      doc.text(value, TV, y, { width: TW, align: "right" });
      y += 19;
    };

    trow("ยอดสินค้า:", `฿${Number(order.subtotal || 0).toFixed(2)}`);
    trow("ค่าจัดส่ง:", Number(order.shippingFee) === 0 ? "ฟรี" : `฿${Number(order.shippingFee).toFixed(2)}`);
    if (Number(order.tax || 0) > 0) trow("ภาษี:", `฿${Number(order.tax).toFixed(2)}`);
    trow("รวมทั้งสิ้น:", `฿${Number(order.grandTotal || 0).toFixed(2)}`, true);

    // ═══════════════════════════════════════════════
    //  FOOTER
    // ═══════════════════════════════════════════════
    y = Math.max(y, 735);
    doc.moveTo(ML, y).lineTo(RE, y).strokeColor("#ddd").stroke();
    y += 12;
    fn(true);
    doc.fontSize(10).fillColor("#777").text(s.footer || "ขอบคุณที่ใช้บริการ", ML, y, { align: "center", width: PW });
    y += 16;
    fn();
    doc.fontSize(8.5).fillColor("#999");
    const cp = [s.storePhone ? `โทร: ${s.storePhone}` : "", s.storeEmail ? `อีเมล: ${s.storeEmail}` : ""].filter(Boolean);
    if (cp.length > 0) doc.text(cp.join(" | "), ML, y, { align: "center", width: PW });

    doc.end();
  });
}
