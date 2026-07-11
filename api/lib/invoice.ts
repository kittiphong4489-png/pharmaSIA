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

  // ── Settings from DB (fully dynamic) ──
  const settingsRows = db.prepare("SELECT key, value FROM store_settings").all() as any[];
  const s: Record<string, string> = {};
  for (const row of settingsRows) s[row.key] = row.value;

  const items = db.prepare("SELECT * FROM order_items WHERE orderId = ?").all(orderId) as any[];

  // ── Parse address ──
  let addr: any = {};
  try { addr = JSON.parse(order.shippingAddressJson || "{}"); } catch {}

  // ── Customer info from users table ──
  let customerUser: any = null;
  if (order.userId) {
    customerUser = db.prepare("SELECT fullName, phone, email FROM users WHERE id = ?").get(order.userId) as any;
  }

  const doc = new PDFDocument({ margin: 55, size: "A4" });
  const buffers: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));

  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    // Register Thai font
    try {
      doc.registerFont("Thai", path.join(FONT_DIR, "Sarabun-Regular.ttf"));
      doc.registerFont("Thai-Bold", path.join(FONT_DIR, "Sarabun-Bold.ttf"));
      doc.registerFont("Thai-Italic", path.join(FONT_DIR, "Sarabun-Italic.ttf"));
    } catch {
      // If font file missing, fallback to built-in (English only)
    }

    const ml = 55;           // left margin
    const mr = 55;           // right margin
    const pw = doc.page.width - ml - mr;  // usable width (~485)
    const col1X = ml;        // product name start
    const col2X = ml + 240;  // qty start
    const col3X = ml + 290;  // unit price start
    const col4X = ml + 355;  // total column start
    const colW = pw - (col4X - ml) - 10; // total column width (~105)
    let y = 42;

    // ══════════════════════════════════════════════
    //  HEADER — Store Info (dynamic from DB)
    // ══════════════════════════════════════════════
    doc.font("Thai-Bold").fontSize(20).fillColor("#1e40af")
      .text(s.storeNameTh || s.storeName || "PharmaCare", ml, y);
    y += 24;

    doc.font("Thai").fontSize(9).fillColor("#6b7280");
    const infoLines: string[] = [];
    if (s.storeAddress) infoLines.push(s.storeAddress);
    if (s.storePhone) infoLines.push(`โทร: ${s.storePhone}`);
    if (s.storeEmail) infoLines.push(`อีเมล: ${s.storeEmail}`);
    if (s.taxId) infoLines.push(`เลขประจำตัวผู้เสียภาษี: ${s.taxId}`);
    for (const line of infoLines) {
      doc.text(line, ml, y, { width: pw * 0.55 });
      y += 14;
    }

    // ══════════════════════════════════════════════
    //  RIGHT SIDE — Order Reference
    // ══════════════════════════════════════════════
    const refY = 42;
    const refX = ml + pw - 10;
    doc.font("Thai-Bold").fontSize(11).fillColor("#111827")
      .text("ใบรายการสั่งซื้อ", refX, refY, { align: "right" });

    doc.font("Thai").fontSize(9).fillColor("#374151");
    let ry = refY + 18;
    doc.text(`เลขที่ออเดอร์: ${order.orderNumber || `#${orderId}`}`, refX, ry, { align: "right" });
    ry += 15;

    const orderDate = new Date(order.orderedAt || order.createdAt);
    doc.text(`วันที่: ${orderDate.toLocaleDateString("th-TH", {
      year: "numeric", month: "long", day: "numeric",
    })}`, refX, ry, { align: "right" });
    ry += 15;

    doc.text(`เวลา: ${orderDate.toLocaleTimeString("th-TH", {
      hour: "2-digit", minute: "2-digit",
    })}`, refX, ry, { align: "right" });
    ry += 15;

    // Status badge
    const statusLabels: Record<string, string> = {
      pending: "รอจ่ายเงิน", paid: "จ่ายแล้ว", confirmed: "รออนุมัติ",
      packing: "กำลังแพ็ค", packed: "รอเข้ารับ", shipping: "กำลังจัดส่ง",
      cancelled: "ยกเลิก", delivered: "ส่งสำเร็จ",
    };
    doc.text(`สถานะ: ${statusLabels[order.status] || order.status}`, refX, ry, { align: "right" });
    ry += 15;

    if (order.trackingNumber) {
      doc.text(`เลขพัสดุ: ${order.trackingNumber}`, refX, ry, { align: "right" });
    }

    // ══════════════════════════════════════════════
    //  SEPARATOR
    // ══════════════════════════════════════════════
    y = Math.max(y + 8, 145);
    doc.moveTo(ml, y).lineTo(ml + pw, y).strokeColor("#e5e7eb").stroke();
    y += 14;

    // ══════════════════════════════════════════════
    //  CUSTOMER INFO
    // ══════════════════════════════════════════════
    doc.font("Thai-Bold").fontSize(10).fillColor("#111827").text("ข้อมูลลูกค้า", ml, y);
    y += 18;
    doc.font("Thai").fontSize(9).fillColor("#374151");
    doc.text(`ชื่อ: ${order.customerName || customerUser?.fullName || "-"}`, ml, y); y += 16;
    doc.text(`โทร: ${order.customerPhone || customerUser?.phone || "-"}`, ml, y); y += 16;
    if (customerUser?.email) {
      doc.text(`อีเมล: ${customerUser.email}`, ml, y); y += 16;
    }
    // Full address
    const addrParts = [
      addr.address, addr.district, addr.province, addr.zip
    ].filter(Boolean).join(" ");
    if (addrParts) {
      doc.text(`ที่อยู่: ${addrParts}`, ml, y, { width: pw }); y += 20;
    }

    // ══════════════════════════════════════════════
    //  TABLE HEADER
    // ══════════════════════════════════════════════
    y += 6;
    doc.moveTo(ml, y).lineTo(ml + pw, y).strokeColor("#d1d5db").stroke(); y += 10;
    doc.font("Thai-Bold").fontSize(9).fillColor("#1e40af");
    doc.text("รายการสินค้า", col1X, y);
    doc.text("จำนวน", col2X, y, { width: 40, align: "center" });
    doc.text("ราคา/หน่วย", col3X + 10, y, { width: 60, align: "right" });
    doc.text("รวมเงิน", col4X + 10, y, { width: colW - 5, align: "right" });
    y += 18;
    doc.moveTo(ml, y).lineTo(ml + pw, y).strokeColor("#d1d5db").stroke(); y += 8;

    // ══════════════════════════════════════════════
    //  ITEMS
    // ══════════════════════════════════════════════
    doc.font("Thai").fontSize(9).fillColor("#374151");
    for (const item of items) {
      const lh = 18;
      const name = (item.productNameTh || item.productNameEn || "สินค้า").substring(0, 80);
      doc.text(name, col1X, y, { width: col2X - col1X - 8 });
      doc.text(String(item.quantity || 1), col2X, y, { width: 40, align: "center" });
      doc.text(`฿${Number(item.unitPrice).toFixed(2)}`, col3X, y, { width: 65, align: "right" });
      doc.text(`฿${(item.subtotal || item.unitPrice * item.quantity).toFixed(2)}`, col4X, y, { width: colW - 5, align: "right" });
      y += lh;
      if (y > 700) { doc.addPage(); y = 50; }
    }

    // ══════════════════════════════════════════════
    //  TOTALS
    // ══════════════════════════════════════════════
    y += 12;
    const totalsX = ml + pw - 180;
    const totalsCol2X = totalsX + 115;
    doc.moveTo(totalsX, y).lineTo(ml + pw, y).strokeColor("#e5e7eb").stroke(); y += 12;
    doc.font("Thai").fontSize(10).fillColor("#374151");
    doc.text("ยอดสินค้า:", totalsX, y); doc.text(`฿${Number(order.subtotal || 0).toFixed(2)}`, totalsCol2X, y, { width: 60, align: "right" }); y += 20;
    doc.text("ค่าจัดส่ง:", totalsX, y); doc.text(Number(order.shippingFee) === 0 ? "ฟรี" : `฿${Number(order.shippingFee).toFixed(2)}`, totalsCol2X, y, { width: 60, align: "right" }); y += 20;
    if (Number(order.tax || 0) > 0) {
      doc.text("ภาษี:", totalsX, y); doc.text(`฿${Number(order.tax).toFixed(2)}`, totalsCol2X, y, { width: 60, align: "right" }); y += 20;
    }
    doc.font("Thai-Bold").fontSize(15).fillColor("#1e40af");
    doc.text("รวมทั้งสิ้น:", totalsX, y); doc.text(`฿${Number(order.grandTotal || 0).toFixed(2)}`, totalsCol2X + 5, y, { width: 60, align: "right" }); y += 32;

    // ══════════════════════════════════════════════
    //  FOOTER (dynamic from DB)
    // ══════════════════════════════════════════════
    y = Math.max(y, 725);
    doc.moveTo(ml, y).lineTo(ml + pw, y).strokeColor("#e5e7eb").stroke(); y += 12;
    doc.font("Thai").fontSize(8.5).fillColor("#9ca3af");
    const footerText = s.footer || "ขอบคุณที่ใช้บริการ";
    doc.text(footerText, ml, y, { align: "center", width: pw }); y += 16;

    const contactParts = [
      s.storePhone ? `โทร: ${s.storePhone}` : "",
      s.lineId ? `LINE: ${s.lineId}` : "",
      s.storeEmail ? `อีเมล: ${s.storeEmail}` : "",
    ].filter(Boolean);
    if (contactParts.length > 0) {
      doc.text(contactParts.join(" | "), ml, y, { align: "center", width: pw });
    }

    doc.end();
  });
}
