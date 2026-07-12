/**
 * api/lib/invoice.ts — Generate PDF invoices (fully dynamic from DB)
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

    try {
      doc.registerFont("Thai", path.join(FONT_DIR, "Sarabun-Regular.ttf"));
      doc.registerFont("Thai-Bold", path.join(FONT_DIR, "Sarabun-Bold.ttf"));
      doc.registerFont("Thai-Italic", path.join(FONT_DIR, "Sarabun-Italic.ttf"));
    } catch {}

    // ── Layout constants ──────────────────────────────────
    const LM = 40;
    const RM = 45;                 // เพิ่มเผื่อขวา
    const PW = doc.page.width - LM - RM - 10;  // safety buffer 10px
    const RE = LM + PW;            // ~540 (แทน 555)
    const COL_MID = LM + PW * 0.5;
    const LEFT_END = COL_MID - 20;
    const RIGHT_START = COL_MID + 10;
    const RIGHT_W = RE - RIGHT_START - 8;  // safety margin 8px

    let y = 32;

    // ── Default font ──
    const useThai = () => { try { doc.font("Thai"); } catch {} };
    const useThaiBold = () => { try { doc.font("Thai-Bold"); } catch {} };

    // ════════════════════════════════════════════════════════
    //  HEADER: Store name (top) | Order info (below, 4cm indent)
    // ════════════════════════════════════════════════════════

    // ── Store Name (moved up 0.5cm = ~14pt) ──
    useThaiBold();
    doc.fontSize(16).fillColor("#2E7D32")
      .text(s.storeNameTh || s.storeName || "PharmaCare", LM, y, { width: PW });
    y += 20;

    // ── Store Details ──
    useThai();
    doc.fontSize(9).fillColor("#555");
    const storeLines: string[] = [];
    if (s.storeAddress) storeLines.push(s.storeAddress);
    if (s.storePhone) storeLines.push(`โทร: ${s.storePhone}`);
    if (s.storeEmail) storeLines.push(`อีเมล: ${s.storeEmail}`);
    if (s.taxId) storeLines.push(`เลขประจำตัวผู้เสียภาษี: ${s.taxId}`);
    for (const line of storeLines) {
      doc.text(line, LM, y, { width: PW });
      y += 13;
    }
    y += 4;

    // ── Order Reference (indent 4cm = ~113pt from left) ──
    const INDENT = 113;  // 4cm in points
    const REF_LEFT = LM + INDENT;
    useThaiBold();
    doc.fontSize(11).fillColor("#333")
      .text("ใบรายการสั่งซื้อ", REF_LEFT, y);
    y += 18;
    useThai();
    doc.fontSize(9).fillColor("#555");
    const refLineH = 14;
    doc.text(`เลขที่ออเดอร์: ${order.orderNumber || `#${orderId}`}`, REF_LEFT, y); y += refLineH;
    const od = new Date(order.orderedAt || order.createdAt);
    doc.text(`วันที่: ${od.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}`, REF_LEFT, y); y += refLineH;
    doc.text(`เวลา: ${od.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`, REF_LEFT, y); y += refLineH;
    const sl: Record<string, string> = { pending: "รอจ่ายเงิน", paid: "จ่ายแล้ว", confirmed: "รออนุมัติ", packing: "กำลังแพ็ค", packed: "รอเข้ารับ", shipping: "กำลังจัดส่ง", cancelled: "ยกเลิก", delivered: "ส่งสำเร็จ" };
    doc.text(`สถานะ: ${sl[order.status] || order.status}`, REF_LEFT, y); y += refLineH;
    if (order.trackingNumber) {
      doc.text(`เลขพัสดุ: ${order.trackingNumber}`, REF_LEFT, y);
    }

    // ════════════════════════════════════════════════════════
    //  SEPARATOR
    // ════════════════════════════════════════════════════════
    y = Math.max(y + 6, 140);
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
    //  QR CODE — สแกนเพื่อดูออเดอร์
    // ════════════════════════════════════════════════════════
    const qrUrl = `https://pharmacare-1783398975-production.up.railway.app/scan/${orderId}`;
    try {
      const qrBuffer = await QRCode.toBuffer(qrUrl, { width: 120, margin: 1 });
      const qrX = RE - 130;
      doc.image(qrBuffer, qrX, y - 30, { width: 110, height: 110 });
      useThai();
      doc.fontSize(7).fillColor("#999")
        .text("สแกน QR เพื่อดูออเดอร์", qrX, y + 85, { width: 110, align: "center" });
    } catch {}

    // ════════════════════════════════════════════════════════
    //  TABLE — Products
    // ════════════════════════════════════════════════════════
    // Column widths: name=fills remaining, qty=60, unitPrice=80, total=80
    const TOT_W = 75;
    const PRICE_W = 75;
    const QTY_W = 55;
    const NAME_W = PW - QTY_W - PRICE_W - TOT_W - 10;
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
    const TL = RE - 190;     // totals label start (shorter)
    const TV = TL + 125;     // totals value start
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
