/**
 * api/lib/telegramNotify.ts
 * Telegram Bot Notifier — แจ้งเตือนออเดอร์ใหม่ผ่าน Telegram ฟรี 100%
 *
 * วิธีตั้งค่า Bot (ทำครั้งเดียว):
 * 1. เปิด Telegram → ค้นหา @BotFather → สั่ง /newbot
 * 2. ตั้งชื่อ Bot → ได้ TELEGRAM_BOT_TOKEN
 * 3. สั่ง /start กับ Bot → หา Chat ID (ส่งข้อความหา Bot แล้วเรียก
 *    https://api.telegram.org/bot{YOUR_TOKEN}/getUpdates)
 * 4. ใส่ค่าลงใน .env หรือ environment variables
 */

const TELEGRAM_API = "https://api.telegram.org/bot";

interface OrderNotification {
  orderNumber: string;
  orderId: number;
  grandTotal: number;
  customerName: string;
  slipUrl?: string;
}

/**
 * sendTelegramNotification — ส่งข้อความแจ้งเตือนไปยัง Telegram
 * Async-friendly: ไม่ block การทำงานหลัก
 */
export async function sendTelegramNotification(order: OrderNotification): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const chatId = process.env.TELEGRAM_CHAT_ID || "";

  if (!token || !chatId) {
    console.log("[Telegram] ⏭️ Skipped — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set");
    return;
  }

  const baseUrl = TELEGRAM_API + token;
  const adminUrl = "https://pharmacare.example.com/seller/orders"; // TODO: เปลี่ยนเป็น URL จริง

  const message = [
    "🚨 *มีคำสั่งซื้อใหม่!*",
    "",
    `🏷️ รหัสออเดอร์: *${order.orderNumber}*`,
    `👤 ลูกค้า: ${order.customerName || "ไม่ระบุ"}`,
    `💰 ยอดรวม: *฿${order.grandTotal?.toFixed(2) || "0.00"}*`,
    "",
    ...(order.slipUrl ? [`📎 สลิปโอนเงิน: ${order.slipUrl}`] : []),
    "",
    `🔗 ตรวจสอบและจัดส่ง: ${adminUrl}`,
    `⏱ ${new Date().toLocaleString("th-TH")}`,
  ].join("\n");

  try {
    const res = await fetch(`${baseUrl}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[Telegram] ❌ Send failed (${res.status}): ${err}`);
    } else {
      console.log(`[Telegram] ✅ Notification sent for ${order.orderNumber}`);
    }
  } catch (err: any) {
    // ไม่บล็อกการทำงานหลัก — แค่ Log ไว้
    console.error(`[Telegram] ⚠️ Network error (non-blocking): ${err?.message || err}`);
  }
}

/**
 * ฟังก์ชันเรียกใน POST /api/orders หลังจากสร้างออเดอร์สำเร็จ
 * ใช้แบบ fire-and-forget — ไม่ต้อง await
 */
export function notifyNewOrderAsync(order: OrderNotification): void {
  sendTelegramNotification(order).catch((err) => {
    console.error("[Telegram] Async error (ignored):", err?.message);
  });
}
