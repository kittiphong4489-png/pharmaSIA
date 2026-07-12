/**
 * api/lib/invoice.ts — Generate PDF invoices (fully dynamic from DB)
 */
import PDFDocument from "pdfkit";
import { getDb } from "../queries/connection";
import path from "path";
import { fileURLToPath } from "url";

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

  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    try {
      doc.registerFont("Thai", path.join(FONT_DIR, "Sarabun-Regular.ttf"));
      doc.registerFont("Thai-Bold", path.join(FONT_DIR, "Sarabun-Bold.ttf"));
      doc.registerFont("Thai-Italic", path.join(FONT_DIR, "Sarabun-Italic.ttf"));
    } catch {}

    // ── Layout constants ──────────────────────────────────
    const LM = 40;
    const RM = 40;
    const PW = doc.page.width - LM - RM;   // ~515
    const RE = LM + PW;                    // ~555
    const COL_MID = LM + PW * 0.5;         // 50% midpoint
    const LEFT_END = COL_MID - 15;         // left col right edge
    const RIGHT_START = COL_MID + 5;       // right col left edge
    const RIGHT_W = RE - RIGHT_START;      // right col width

    let y = 40;

    // ── Default font ──
    const useThai = () => { try { doc.font("Thai"); } catch {} };
    const useThaiBold = () => { try { doc.font("Thai-Bold"); } catch {} };

    // ════════════════════════════════════════════════════════
    //  HEADER: 2-COLUMN — Store (L) | Order Info (R)
    // ════════════════════════════════════════════════════════

    // ── LEFT COLUMN: Store Info ──
    useThaiBold();
    doc.fontSize(16).fillColor("#2E7D32")
      .text(s.storeNameTh || s.storeName || "PharmaCare", LM, y, { width: LEFT_END - LM });
    y += 20;

    useThai();
    doc.fontSize(9).fillColor("#555");
    const storeLines: string[] = [];
    if (s.storeAddress) storeLines.push(s.storeAddress);
    if (s.storePhone) storeLines.push(`โทร: ${s.storePhone}`);
    if (s.storeEmail) storeLines.push(`อีเมล: ${s.storeEmail}`);
    if (s.taxId) storeLines.push(`เลขประจำตัวผู้เสียภาษี: ${s.taxId}`);
    for (const line of storeLines) {
      doc.text(line, LM, y, { width: LEFT_END - LM });
      y += 13;
    }

    // ── RIGHT COLUMN: Order Reference (aligned right) ──
    const refStartY = 40;
    useThaiBold();
    doc.fontSize(11).fillColor("#333")
      .text("ใบรายการสั่งซื้อ", RIGHT_START, refStartY, { width: RIGHT_W, align: "right" });

    useThai();
    doc.fontSize(9).fillColor("#555");
    let ry = refStartY + 20;
    const rh = 14;
    doc.text(`เลขที่ออเดอร์: ${order.orderNumber || `#${orderId}`}`, RIGHT_START, ry, { width: RIGHT_W, align: "right" }); ry += rh;
    const od = new Date(order.orderedAt || order.createdAt);
    doc.text(`วันที่: ${od.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}`, RIGHT_START, ry, { width: RIGHT_W, align: "right" }); ry += rh;
    doc.text(`เวลา: ${od.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`, RIGHT_START, ry, { width: RIGHT_W, align: "right" }); ry += rh;
    const sl: Record<string, string> = { pending: "รอจ่ายเงิน", paid: "จ่ายแล้ว", confirmed: "รออนุมัติ", packing: "กำลังแพ็ค", packed: "รอเข้ารับ", shipping: "กำลังจัดส่ง", cancelled: "ยกเลิก", delivered: "ส่งสำเร็จ" };
    doc.text(`สถานะ: ${sl[order.status] || order.status}`, RIGHT_START, ry, { width: RIGHT_W, align: "right" }); ry += rh;
    if (order.trackingNumber) {
      doc.text(`เลขพัสดุ: ${order.trackingNumber}`, RIGHT_START, ry, { width: RIGHT_W, align: "right" });
    }

    // ════════════════════════════════════════════════════════
    //  SEPARATOR
    // ════════════════════════════════════════════════════════
    y = Math.max(y + 4, 130);
    doc.moveTo(LM, y).lineTo(RE, y).strokeColor("#ddd").stroke();
    y += 14;

    // ════════════════════════════════════════════════════════
    //  CUSTOMER INFO
    // ════════════════════════════════════════════════════════
    useThaiBold();
    doc.fontSize(11).fillColor("#333").text("ข้อมูลลูกค้า", LM, y);
    y += 17;
    useThai();
    doc.fontSize(9).fillColor("#555");
    doc.text(`ชื่อ: ${order.customerName || customerUser?.fullName || "-"}`, LM, y); y += 14;
    doc.text(`โทร: ${order.customerPhone || customerUser?.phone || "-"}`, LM, y); y += 14;
    if (customerUser?.email) { doc.text(`อีเมล: ${customerUser.email}`, LM, y); y += 14; }
    const ap = [addr.address, addr.district, addr.province, addr.zip].filter(Boolean).join(" ");
    if (ap) {
      doc.text(`ที่อยู่: ${ap}`, LM, y, { width: PW }); y += 18;
    }

    // ════════════════════════════════════════════════════════
    //  TABLE — Products
    // ════════════════════════════════════════════════════════
    // Column widths: name=fills remaining, qty=60, unitPrice=80, total=80
    const TOT_W = 80;
    const PRICE_W = 80;
    const QTY_W = 60;
    const NAME_W = PW - QTY_W - PRICE_W - TOT_W;
    const T_QTY = LM + NAME_W;
    const T_PRICE = T_QTY + QTY_W;
    const T_TOTAL = T_PRICE + PRICE_W;

    y += 6;
    doc.moveTo(LM, y).lineTo(RE, y).strokeColor("#ccc").stroke(); y += 9;
    useThaiBold();
    doc.fontSize(9).fillColor("#2E7D32");
    doc.text("รายการสินค้า", LM, y);
    doc.text("จำนวน", T_QTY, y, { width: QTY_W, align: "right" });
    doc.text("ราคา/หน่วย", T_PRICE, y, { width: PRICE_W, align: "right" });
    doc.text("รวม", T_TOTAL, y, { width: TOT_W, align: "right" });
    y += 16;
    doc.moveTo(LM, y).lineTo(RE, y).strokeColor("#ccc").stroke(); y += 7;

    useThai();
    doc.fontSize(9).fillColor("#444");
    for (const item of items) {
      const nm = (item.productNameTh || item.productNameEn || "สินค้า").substring(0, 80);
      doc.text(nm, LM, y, { width: NAME_W - 6 });
      doc.text(String(item.quantity || 1), T_QTY, y, { width: QTY_W, align: "right" });
      doc.text(`฿${Number(item.unitPrice).toFixed(2)}`, T_PRICE, y, { width: PRICE_W, align: "right" });
      doc.text(`฿${(item.subtotal || item.unitPrice * item.quantity).toFixed(2)}`, T_TOTAL, y, { width: TOT_W, align: "right" });
      y += 16;
      if (y > 700) { doc.addPage(); y = 50; }
    }

    // ════════════════════════════════════════════════════════
    //  TOTALS — Right-aligned, no border table style
    // ════════════════════════════════════════════════════════
    y += 12;
    const TL = RE - 200;     // totals label start (right side)
    const TV = TL + 130;     // totals value start
    doc.moveTo(TL, y).lineTo(RE, y).strokeColor("#ddd").stroke(); y += 10;

    useThai();
    doc.fontSize(10).fillColor("#444");
    const rowH = 18;
    const renderRow = (label: string, value: string, bold = false) => {
      if (bold) {
        useThaiBold();
        doc.fontSize(14).fillColor("#2E7D32");
      } else {
        useThai();
        doc.fontSize(10).fillColor("#444");
      }
      doc.text(label, TL, y, { width: TV - TL - 5 });
      doc.text(value, TV, y, { width: RE - TV - 5, align: "right" });
      y += rowH;
    };

    renderRow("ยอดสินค้า:", `฿${Number(order.subtotal || 0).toFixed(2)}`);
    renderRow("ค่าจัดส่ง:", Number(order.shippingFee) === 0 ? "ฟรี" : `฿${Number(order.shippingFee).toFixed(2)}`);
    if (Number(order.tax || 0) > 0) {
      renderRow("ภาษี:", `฿${Number(order.tax).toFixed(2)}`);
    }
    renderRow("รวมทั้งสิ้น:", `฿${Number(order.grandTotal || 0).toFixed(2)}`, true);

    // ════════════════════════════════════════════════════════
    //  FOOTER
    // ════════════════════════════════════════════════════════
    y = Math.max(y + 5, 725);
    doc.moveTo(LM, y).lineTo(RE, y).strokeColor("#ddd").stroke(); y += 12;
    useThaiBold();
    doc.fontSize(11).fillColor("#777").text(s.footer || "ขอบคุณที่ใช้บริการ", LM, y, { align: "center", width: PW });
    y += 16;
    useThai();
    doc.fontSize(9).fillColor("#999");
    const cp = [s.storePhone ? `โทร: ${s.storePhone}` : "", s.lineId ? `LINE: ${s.lineId}` : "", s.storeEmail ? `อีเมล: ${s.storeEmail}` : ""].filter(Boolean);
    if (cp.length > 0) {
      doc.text(cp.join(" | "), LM, y, { align: "center", width: PW });
    }
    doc.end();
  });
}
