/**
 * api/lib/telegramNotify.ts
 * Telegram Bot Notifier — แจ้งเตือนออเดอร์ + ปุ่มอนุมัติ
 *
 * รองรับ Inline Keyboard:
 *   ✅ อนุมัติ → แจ้ง Admin ว่าอนุมัติสำเร็จ
 *   ❌ ปฏิเสธ → ให้ Admin พิมพ์เหตุผล
 *
 * วิธีตั้งค่า (ทำครั้งเดียว):
 * 1. @BotFather → /newbot → ได้ TELEGRAM_BOT_TOKEN
 * 2. ส่งข้อความหา Bot → https://api.telegram.org/bot{TOKEN}/getUpdates → หา Chat ID
 * 3. ใส่ .env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 * 4. ต้อง Deploy ให้ Railway URL ตรงกับ BOT_DOMAIN
 */

const TELEGRAM_API = "https://api.telegram.org/bot";

interface OrderItem {
  productNameTh?: string;
  quantity?: number;
  unitPrice?: number;
  subtotal?: number;
}

interface FullOrderNotification {
  orderId: number;
  orderNumber: string;
  grandTotal: number;
  customerName: string;
  customerPhone?: string;
  shippingFee?: number;
  items?: OrderItem[];
  slipUrl?: string;
  shippingAddress?: string;
}

/**
 * sendOrderNotificationWithActions — ส่งข้อความแจ้งเตือน + ปุ่ม
 */
export async function sendOrderNotificationWithActions(order: FullOrderNotification): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const chatId = process.env.TELEGRAM_CHAT_ID || "";
  const botDomain = process.env.BOT_DOMAIN || "https://pharmacare-1783398975-production.up.railway.app";

  if (!token || !chatId) {
    console.log("[Telegram] ⏭️ Skipped — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set");
    return;
  }

  const baseUrl = TELEGRAM_API + token;

  // ── Build order details message ──
  const itemLines = (order.items || []).slice(0, 8).map((it, i) =>
    `${i + 1}. ${(it.productNameTh || "สินค้า").substring(0, 50)} x${it.quantity || 1} = ฿${(it.subtotal || 0).toFixed(2)}`
  ).join("\n");
  const moreItems = (order.items || []).length > 8
    ? `\n...และอีก ${(order.items || []).length - 8} รายการ`
    : "";

  const message = [
    "🚨 *มีคำสั่งซื้อใหม่!*",
    "",
    `🏷️ ออเดอร์: *${order.orderNumber}*`,
    `👤 ลูกค้า: ${order.customerName || "ไม่ระบุ"}`,
    `📞 โทร: ${order.customerPhone || "-"}`,
    "",
    `📦 *สินค้า:*`,
    itemLines + moreItems,
    "",
    ...(order.shippingFee !== undefined ? [`🚚 ค่าจัดส่ง: ${order.shippingFee === 0 ? "ฟรี" : `฿${order.shippingFee.toFixed(2)}`}`] : []),
    `💰 *ยอดรวม: ฿${order.grandTotal?.toFixed(2) || "0.00"}*`,
    "",
    ...(order.shippingAddress ? [`📍 ที่อยู่: ${order.shippingAddress.substring(0, 100)}`] : []),
    ...(order.slipUrl ? [`📎 สลิป: ${order.slipUrl}`] : []),
    "",
    `⏱ ${new Date().toLocaleString("th-TH")}`,
  ].join("\n");

  try {
    // Send the message with inline buttons
    await fetch(`${baseUrl}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [[
            {
              text: "✅ อนุมัติออเดอร์",
              callback_data: `approve:${order.orderId}`,
            },
            {
              text: "❌ ปฏิเสธ",
              callback_data: `reject:${order.orderId}`,
            },
          ]],
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
    console.log(`[Telegram] ✅ Sent with buttons for ${order.orderNumber}`);
  } catch (err: any) {
    console.error(`[Telegram] ⚠️ Error (non-blocking): ${err?.message || err}`);
  }
}

/**
 * Telegram webhook handler — รับ callback จากปุ่ม
 * เอาไป mount ที่ app.post("/telegram/callback", ...)
 */
export async function handleTelegramCallback(body: any): Promise<string> {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const chatId = process.env.TELEGRAM_CHAT_ID || "";
  if (!token || !chatId) return "No token";

  const callbackData = body?.callback_query?.data || "";
  const callbackId = body?.callback_query?.id || "";
  const messageId = body?.callback_query?.message?.message_id || 0;

  if (!callbackData) return "No callback data";

  const baseUrl = TELEGRAM_API + token;

  if (callbackData.startsWith("approve:")) {
    const orderId = parseInt(callbackData.split(":")[1]);
    
    // Answer the callback (remove loading state)
    await fetch(`${baseUrl}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackId,
        text: "⏳ กำลังอนุมัติออเดอร์...",
        show_alert: false,
      }),
    });

    // Update order in database
    try {
      const { getDb } = await import("../queries/connection");
      const db = getDb();
      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as any;
      if (order && order.status === "pending") {
        db.prepare("UPDATE orders SET status = 'paid', paidAt = datetime('now'), updatedAt = datetime('now') WHERE id = ?").run(orderId);
        console.log(`[Telegram] ✅ Order #${orderId} approved via Telegram`);
      }
    } catch (e: any) {
      console.error("[Telegram] DB update error:", e?.message);
    }

    // Update the message to show approved
    await fetch(`${baseUrl}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: `✅ *ออเดอร์ #${orderId} ได้รับการอนุมัติแล้ว!*\n\n(โดย Admin ผ่าน Telegram)\n⏱ ${new Date().toLocaleString("th-TH")}`,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [] },
      }),
    });

    return `approved:${orderId}`;
  }

  if (callbackData.startsWith("reject:")) {
    const orderId = parseInt(callbackData.split(":")[1]);

    await fetch(`${baseUrl}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackId,
        text: "พิมพ์เหตุผลที่ปฏิเสธ (ตอบกลับในแชทนี้)",
        show_alert: true,
      }),
    });

    return `rejected:${orderId}`;
  }

  return "Unknown action";
}

/**
 * ฟังก์ชันเรียกใน POST /api/orders หลังจากสร้างออเดอร์สำเร็จ
 */
export function notifyNewOrderAsync(order: any): void {
  sendOrderNotificationWithActions(order).catch((err) => {
    console.error("[Telegram] Async error (ignored):", err?.message);
  });
}
