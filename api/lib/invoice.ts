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

  const doc = new PDFDocument({ margin: 50, size: "A4" });
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

    const pw = doc.page.width - 100;
    const rx = doc.page.width - 50;
    let y = 45;

    // ══════════════════════════════════════════════
    //  HEADER — Store Info (dynamic from DB)
    // ══════════════════════════════════════════════
    doc.font("Thai-Bold").fontSize(22).fillColor("#1e40af")
      .text(s.storeNameTh || s.storeName || "PharmaCare", 50, y);

    y += 22;
    doc.font("Thai").fontSize(8).fillColor("#6b7280");
    if (s.storeAddress) {
      doc.text(s.storeAddress, 50, y, { width: 250 });
      y += 12;
    }
    if (s.storePhone) {
      doc.text(`โทร: ${s.storePhone}`, 50, y);
      y += 12;
    }
    if (s.storeEmail) {
      doc.text(`อีเมล: ${s.storeEmail}`, 50, y);
      y += 12;
    }
    if (s.taxId) {
      doc.text(`เลขประจำตัวผู้เสียภาษี: ${s.taxId}`, 50, y);
      y += 12;
    }

    // ══════════════════════════════════════════════
    //  RIGHT SIDE — Order Reference
    // ══════════════════════════════════════════════
    const refY = 45;
    doc.font("Thai-Bold").fontSize(10).fillColor("#111827")
      .text("ใบรายการสั่งซื้อ", rx, refY, { align: "right" });

    doc.font("Thai").fontSize(9).fillColor("#374151")
      .text(`เลขที่ออเดอร์: ${order.orderNumber || `#${orderId}`}`, rx, refY + 16, { align: "right" });

    const orderDate = new Date(order.orderedAt || order.createdAt);
    doc.text(`วันที่สั่งซื้อ: ${orderDate.toLocaleDateString("th-TH", {
      year: "numeric", month: "long", day: "numeric",
    })}`, rx, refY + 30, { align: "right" });

    doc.text(`เวลา: ${orderDate.toLocaleTimeString("th-TH", {
      hour: "2-digit", minute: "2-digit",
    })}`, rx, refY + 44, { align: "right" });

    // Status badge
    const statusLabels: Record<string, string> = {
      pending: "รอจ่ายเงิน", paid: "จ่ายแล้ว", confirmed: "รออนุมัติ",
      packing: "กำลังแพ็ค", packed: "รอเข้ารับ", shipping: "กำลังจัดส่ง",
      cancelled: "ยกเลิก", delivered: "ส่งสำเร็จ",
    };
    doc.text(`สถานะ: ${statusLabels[order.status] || order.status}`, rx, refY + 58, { align: "right" });

    if (order.trackingNumber) {
      doc.text(`เลขพัสดุ: ${order.trackingNumber}`, rx, refY + 72, { align: "right" });
    }

    // ══════════════════════════════════════════════
    //  SEPARATOR
    // ══════════════════════════════════════════════
    y = Math.max(y + 10, 130);
    doc.moveTo(50, y).lineTo(pw + 50, y).strokeColor("#e5e7eb").stroke();
    y += 12;

    // ══════════════════════════════════════════════
    //  CUSTOMER INFO
    // ══════════════════════════════════════════════
    doc.font("Thai-Bold").fontSize(10).fillColor("#111827").text("ข้อมูลลูกค้า", 50, y);
    y += 16;
    doc.font("Thai").fontSize(9).fillColor("#374151");
    doc.text(`ชื่อ: ${order.customerName || customerUser?.fullName || "-"}`, 50, y); y += 14;
    doc.text(`โทร: ${order.customerPhone || customerUser?.phone || "-"}`, 50, y); y += 14;
    if (customerUser?.email) {
      doc.text(`อีเมล: ${customerUser.email}`, 50, y); y += 14;
    }
    // Full address
    const addrParts = [
      addr.address, addr.district, addr.province, addr.zip
    ].filter(Boolean).join(" ");
    if (addrParts) {
      doc.text(`ที่อยู่: ${addrParts}`, 50, y, { width: pw }); y += 18;
    }

    // ══════════════════════════════════════════════
    //  TABLE HEADER
    // ══════════════════════════════════════════════
    y += 4;
    doc.moveTo(50, y).lineTo(pw + 50, y).strokeColor("#e5e7eb").stroke(); y += 8;
    doc.font("Thai-Bold").fontSize(9).fillColor("#1e40af");
    doc.text("รายการสินค้า", 50, y, { width: 240 });
    doc.text("จำนวน", 320, y, { width: 30, align: "center" });
    doc.text("ราคา/หน่วย", 370, y, { width: 55, align: "right" });
    doc.text("รวม", 430, y + 0.5, { width: 65, align: "right" });
    y += 16;
    doc.moveTo(50, y).lineTo(495, y).strokeColor("#e5e7eb").stroke(); y += 6;

    // ══════════════════════════════════════════════
    //  ITEMS
    // ══════════════════════════════════════════════
    doc.font("Thai").fontSize(8.5).fillColor("#374151");
    for (const item of items) {
      const lh = 16;
      const name = (item.productNameTh || item.productNameEn || "สินค้า").substring(0, 80);
      doc.text(name, 50, y, { width: 260 });
      doc.text(String(item.quantity || 1), 320, y, { width: 30, align: "center" });
      doc.text(`฿${Number(item.unitPrice).toFixed(2)}`, 355, y, { width: 60, align: "right" });
      doc.text(`฿${(item.subtotal || item.unitPrice * item.quantity).toFixed(2)}`, 430, y, { width: 65, align: "right" });
      y += lh;
      if (y > 700) { doc.addPage(); y = 50; }
    }

    // ══════════════════════════════════════════════
    //  TOTALS
    // ══════════════════════════════════════════════
    y += 10;
    doc.moveTo(300, y).lineTo(pw + 50, y).strokeColor("#e5e7eb").stroke(); y += 10;
    doc.font("Thai").fontSize(9.5).fillColor("#374151");
    doc.text("ยอดสินค้า:", 300, y, { width: 120, align: "right" });
    doc.text(`฿${Number(order.subtotal || 0).toFixed(2)}`, 430, y, { width: 65, align: "right" }); y += 18;
    doc.text("ค่าจัดส่ง:", 300, y, { width: 120, align: "right" });
    doc.text(Number(order.shippingFee) === 0 ? "ฟรี" : `฿${Number(order.shippingFee).toFixed(2)}`, 430, y, { width: 65, align: "right" }); y += 18;
    if (Number(order.tax || 0) > 0) {
      doc.text("ภาษี:", 300, y, { width: 120, align: "right" });
      doc.text(`฿${Number(order.tax).toFixed(2)}`, 430, y, { width: 65, align: "right" }); y += 18;
    }
    doc.font("Thai-Bold").fontSize(14).fillColor("#1e40af");
    doc.text("รวมทั้งสิ้น:", 300, y, { width: 120, align: "right" });
    doc.text(`฿${Number(order.grandTotal || 0).toFixed(2)}`, 430, y, { width: 65, align: "right" }); y += 30;

    // ══════════════════════════════════════════════
    //  FOOTER (dynamic from DB)
    // ══════════════════════════════════════════════
    y = Math.max(y, 720);
    doc.moveTo(50, y).lineTo(pw + 50, y).strokeColor("#e5e7eb").stroke(); y += 10;
    doc.font("Thai").fontSize(8).fillColor("#9ca3af");
    const footerText = s.footer || "ขอบคุณที่ใช้บริการ";
    doc.text(footerText, 50, y, { align: "center" }); y += 14;

    const contactParts = [
      s.storePhone ? `โทร: ${s.storePhone}` : "",
      s.lineId ? `LINE: ${s.lineId}` : "",
      s.storeEmail ? `อีเมล: ${s.storeEmail}` : "",
    ].filter(Boolean);
    if (contactParts.length > 0) {
      doc.text(contactParts.join(" | "), 50, y, { align: "center" });
    }

    doc.end();
  });
}
