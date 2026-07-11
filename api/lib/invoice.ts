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

  const doc = new PDFDocument({ margin: 50, size: "A4" });
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

    // ── Layout constants ──
    const LM = 50;                 // left margin
    const RM = 50;                 // right margin
    const PW = doc.page.width - LM - RM;   // printable width (~495)
    const RE = LM + PW;            // right edge of content (=LM+PW, ~545)

    // Left column (store info)
    const LC_W = 260;              // left column width
    const LC_R = LM + LC_W;        // left column right edge (50+260=310)

    // Right column (order reference)
    const RC_L = LC_R + 20;        // right column left edge (310+20=330)
    const RC_W = RE - RC_L;        // right column width (~545-330=215)

    // Table columns (within PW)
    const T_NAME  = LM;            // product name start
    const T_QTY   = LM + 240;     // qty start (290)
    const T_PRICE = LM + 295;     // unit price start (345)
    const T_TOTAL = LM + 365;     // total start (415)
    const T_WIDTH = RE - T_TOTAL; // total column width (~545-415=130)

    let y = 42;

    // ══════════════════════════════════════════════
    //  HEADER — Store Info (left column)
    // ══════════════════════════════════════════════
    doc.font("Thai-Bold").fontSize(20).fillColor("#1e40af")
      .text(s.storeNameTh || s.storeName || "PharmaCare", LM, y, { width: LC_W });

    y += 26;
    doc.font("Thai").fontSize(9).fillColor("#6b7280");
    const infoLines: string[] = [];
    if (s.storeAddress) infoLines.push(s.storeAddress);
    if (s.storePhone) infoLines.push(`โทร: ${s.storePhone}`);
    if (s.storeEmail) infoLines.push(`อีเมล: ${s.storeEmail}`);
    if (s.taxId) infoLines.push(`เลขประจำตัวผู้เสียภาษี: ${s.taxId}`);
    for (const line of infoLines) {
      doc.text(line, LM, y, { width: LC_W });
      y += 13;
    }

    // ══════════════════════════════════════════════
    //  RIGHT SIDE — Order Reference
    // ══════════════════════════════════════════════
    const refY = 42;
    doc.font("Thai-Bold").fontSize(11).fillColor("#111827")
      .text("ใบรายการสั่งซื้อ", RC_L, refY, { width: RC_W, align: "right" });

    doc.font("Thai").fontSize(9).fillColor("#374151");
    let ry = refY + 20;
    const refLineH = 14;
    doc.text(`เลขที่ออเดอร์: ${order.orderNumber || `#${orderId}`}`, RC_L, ry, { width: RC_W, align: "right" });
    ry += refLineH;
    const orderDate = new Date(order.orderedAt || order.createdAt);
    doc.text(`วันที่: ${orderDate.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}`, RC_L, ry, { width: RC_W, align: "right" });
    ry += refLineH;
    doc.text(`เวลา: ${orderDate.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`, RC_L, ry, { width: RC_W, align: "right" });
    ry += refLineH;
    const statusLabels: Record<string, string> = {
      pending: "รอจ่ายเงิน", paid: "จ่ายแล้ว", confirmed: "รออนุมัติ",
      packing: "กำลังแพ็ค", packed: "รอเข้ารับ", shipping: "กำลังจัดส่ง",
      cancelled: "ยกเลิก", delivered: "ส่งสำเร็จ",
    };
    doc.text(`สถานะ: ${statusLabels[order.status] || order.status}`, RC_L, ry, { width: RC_W, align: "right" });
    ry += refLineH;
    if (order.trackingNumber) {
      doc.text(`เลขพัสดุ: ${order.trackingNumber}`, RC_L, ry, { width: RC_W, align: "right" });
    }

    // ══════════════════════════════════════════════
    //  SEPARATOR
    // ══════════════════════════════════════════════
    y = Math.max(y + 6, 135);
    doc.moveTo(LM, y).lineTo(RE, y).strokeColor("#e5e7eb").stroke();
    y += 14;

    // ══════════════════════════════════════════════
    //  CUSTOMER INFO
    // ══════════════════════════════════════════════
    doc.font("Thai-Bold").fontSize(10).fillColor("#111827").text("ข้อมูลลูกค้า", LM, y);
    y += 18;
    doc.font("Thai").fontSize(9).fillColor("#374151");
    doc.text(`ชื่อ: ${order.customerName || customerUser?.fullName || "-"}`, LM, y); y += 15;
    doc.text(`โทร: ${order.customerPhone || customerUser?.phone || "-"}`, LM, y); y += 15;
    if (customerUser?.email) { doc.text(`อีเมล: ${customerUser.email}`, LM, y); y += 15; }
    const addrParts = [addr.address, addr.district, addr.province, addr.zip].filter(Boolean).join(" ");
    if (addrParts) {
      doc.text(`ที่อยู่: ${addrParts}`, LM, y, { width: PW }); y += 20;
    }

    // ══════════════════════════════════════════════
    //  TABLE HEADER
    // ══════════════════════════════════════════════
    y += 4;
    doc.moveTo(LM, y).lineTo(RE, y).strokeColor("#d1d5db").stroke(); y += 9;
    doc.font("Thai-Bold").fontSize(9).fillColor("#1e40af");
    doc.text("รายการสินค้า", T_NAME, y);
    doc.text("จำนวน", T_QTY, y, { width: 40, align: "center" });
    doc.text("ราคา/หน่วย", T_PRICE, y, { width: 70, align: "right" });
    doc.text("รวมเงิน", T_TOTAL, y, { width: T_WIDTH - 8, align: "right" });
    y += 17;
    doc.moveTo(LM, y).lineTo(RE, y).strokeColor("#d1d5db").stroke(); y += 7;

    // ══════════════════════════════════════════════
    //  ITEMS
    // ══════════════════════════════════════════════
    doc.font("Thai").fontSize(9).fillColor("#374151");
    for (const item of items) {
      const name = (item.productNameTh || item.productNameEn || "สินค้า").substring(0, 80);
      doc.text(name, T_NAME, y, { width: T_QTY - T_NAME - 6 });
      doc.text(String(item.quantity || 1), T_QTY, y, { width: 40, align: "center" });
      doc.text(`฿${Number(item.unitPrice)| 0}`, T_PRICE, y, { width: 70, align: "right" });
      doc.text(`฿${(item.subtotal || item.unitPrice * item.quantity)| 0}`, T_TOTAL, y, { width: T_WIDTH - 8, align: "right" });
      y += 17;
      if (y > 700) { doc.addPage(); y = 50; }
    }

    // ══════════════════════════════════════════════
    //  TOTALS
    // ══════════════════════════════════════════════
    y += 10;
    const totL = RE - 180;   // totals label start (545-180=365)
    const totV = RE - 70;    // totals value start (545-70=475)
    const totW = 65;         // totals value width
    doc.moveTo(totL, y).lineTo(RE, y).strokeColor("#e5e7eb").stroke(); y += 11;
    doc.font("Thai").fontSize(10).fillColor("#374151");
    doc.text("ยอดสินค้า:", totL, y); doc.text(`฿${Number(order.subtotal || 0)| 0}`, totV, y, { width: totW, align: "right" }); y += 19;
    doc.text("ค่าจัดส่ง:", totL, y); doc.text(Number(order.shippingFee) === 0 ? "ฟรี" : `฿${Number(order.shippingFee)| 0}`, totV, y, { width: totW, align: "right" }); y += 19;
    if (Number(order.tax || 0) > 0) {
      doc.text("ภาษี:", totL, y); doc.text(`฿${Number(order.tax)| 0}`, totV, y, { width: totW, align: "right" }); y += 19;
    }
    doc.font("Thai-Bold").fontSize(14).fillColor("#1e40af");
    doc.text("รวมทั้งสิ้น:", totL, y); doc.text(`฿${Number(order.grandTotal || 0)| 0}`, totV, y, { width: totW + 5, align: "right" }); y += 30;

    // ══════════════════════════════════════════════
    //  FOOTER
    // ══════════════════════════════════════════════
    y = Math.max(y, 725);
    doc.moveTo(LM, y).lineTo(RE, y).strokeColor("#e5e7eb").stroke(); y += 12;
    doc.font("Thai").fontSize(8.5).fillColor("#9ca3af");
    doc.text(s.footer || "ขอบคุณที่ใช้บริการ", LM, y, { align: "center", width: PW }); y += 16;
    const contactParts = [
      s.storePhone ? `โทร: ${s.storePhone}` : "",
      s.lineId ? `LINE: ${s.lineId}` : "",
      s.storeEmail ? `อีเมล: ${s.storeEmail}` : "",
    ].filter(Boolean);
    if (contactParts.length > 0) {
      doc.text(contactParts.join(" | "), LM, y, { align: "center", width: PW });
    }
    doc.end();
  });
}
