import { useState, useRef, useEffect } from "react";
import type { Product } from "../types";
import { apiClient } from "../lib/api";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  actions?: { label: string; action: string; payload?: any }[];
}

const WELCOME = `สวัสดีครับ! 🚀 ผม PharmaSIA Assistant

ผมช่วยคุณจัดการร้านได้จริงๆ เช่น:
• "ซิงค์ Forte หน่อย" → ดึงสินค้าจาก Forte
• "แสดงออเดอร์ที่ค้าง" → ดูออเดอร์
• "อัปเดตราคาพาราเซตามอล" → ตั้งราคา
• "สถิติร้านวันนี้" → ดู Dashboard
• "บอกข้อมูลร้าน" → ดูข้อมูลร้าน

พิมพ์มาได้เลยครับ!`;

const ACTIONS: Record<string, { label: string; action: string }> = {
  forte: { label: "⚡ ซิงค์ Forte", action: "forte" },
  stats: { label: "📊 สถิติร้าน", action: "stats" },
  orders: { label: "📋 ออเดอร์ล่าสุด", action: "orders" },
  products: { label: "📦 สินค้าทั้งหมด", action: "products" },
  pricing: { label: "💰 ตั้งราคา", action: "pricing" },
};

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: WELCOME, actions: Object.values(ACTIONS) },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [memory, setMemory] = useState<{ role: string; content: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem("chat_memory") || "[]"); } catch { return []; }
  });
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    localStorage.setItem("chat_memory", JSON.stringify(memory.slice(-50)));
  }, [messages, open, memory]);

  const addMsg = (msg: ChatMessage) => setMessages(p => [...p, msg]);
  const setLoading_ = (v: boolean) => setLoading(v);

  const executeAction = async (action: string, payload?: any) => {
    setLoading(true);
    try {
      switch (action) {
        case "stats": {
          const data = await apiClient("/api/seller/stats");
          addMsg({
            role: "assistant",
            content: `📊 **สถิติร้าน**\n• สินค้าทั้งหมด: ${d.totalProducts || 0} รายการ\n• ออเดอร์: ${d.totalOrders || 0} รายการ\n• ยอดขาย: ฿${(d.totalRevenue || 0).toLocaleString()}\n• ออเดอร์รอ: ${d.pendingOrders || 0}`,
            actions: Object.values(ACTIONS),
          });
          break;
        }
        case "orders": {
          const data = await apiClient("/api/seller/orders");
          const orders = (d.orders || []).slice(0, 5);
          let txt = `📋 **ออเดอร์ล่าสุด ${d.orders?.length || 0} รายการ**\n`;
          for (const o of orders) {
            txt += `• #${o.orderNumber} — ${o.customerName} — ${o.status} — ฿${o.grandTotal}\n`;
          }
          addMsg({ role: "assistant", content: txt, actions: Object.values(ACTIONS) });
          break;
        }
        case "products": {
          const data = await apiClient("/api/products?limit=5");
          let txt = `📦 **สินค้าทั้งหมด ${d.total} รายการ**\n`;
          for (const p of (d.items || []).slice(0, 5)) {
            txt += `• ${p.nameTh} — ฿${p.price} (สต็อก ${p.stock})\n`;
          }
          addMsg({ role: "assistant", content: txt, actions: Object.values(ACTIONS) });
          break;
        }
        case "pricing": {
          addMsg({ role: "assistant", content: "💰 ไปที่ /seller/pricing เพื่อตั้งราคาสินค้าได้เลยครับ" });
          break;
        }
        case "forte": {
          addMsg({ role: "assistant", content: "⚡ ไปที่ /seller/forte เพื่อซิงค์สินค้าจาก Forte ได้เลยครับ" });
          break;
        }
        default: {
          const data = await apiClient("/api/chat", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: input, history: memory.slice(-10) }),
          });
          setMemory(p => [...p, { role: "user", content: input }, { role: "assistant", content: data.reply }]);
          addMsg({ role: "assistant", content: data.reply, actions: Object.values(ACTIONS) });
        }
      }
    } catch { addMsg({ role: "assistant", content: "❌ เกิดข้อผิดพลาด", actions: Object.values(ACTIONS) }); }
    setLoading(false);
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput("");
    addMsg({ role: "user", content: msg });

    // Detect quick actions from natural language
    const lower = msg.toLowerCase();
    if (lower.includes("forte") || lower.includes("ซิงค์") || lower.includes("ฟอร์เต")) {
      executeAction("forte"); return;
    }
    if (lower.includes("สถิติ") || lower.includes("dashboard") || lower.includes("ยอด")) {
      executeAction("stats"); return;
    }
    if (lower.includes("ออเดอร์") || lower.includes("order") || lower.includes("ค้าง") || lower.includes("pending")) {
      executeAction("orders"); return;
    }
    if (lower.includes("สินค้า") || lower.includes("product") || lower.includes("รายการ")) {
      executeAction("products"); return;
    }
    if (lower.includes("ราคา") || lower.includes("price") || lower.includes("margin")) {
      executeAction("pricing"); return;
    }

    // Fallback to AI chat
    executeAction("chat", msg);
  };

  return (
    <>
      <button onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center hover:scale-105">
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
          <div className="p-4 bg-gradient-to-r from-blue-500 to-blue-700 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">🤖</div>
                <div>
                  <p className="font-semibold text-sm">PharmaSIA Assistant</p>
                  <p className="text-xs text-blue-100">สั่งงานหลังบ้านได้</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/20 rounded-lg">✕</button>
            </div>
          </div>

          <div className="h-80 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {messages.map((m, i) => (
              <div key={i}>
                <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user" ? "bg-blue-600 text-white rounded-br-md" : "bg-white text-gray-800 border border-gray-100 rounded-bl-md shadow-sm"
                  }`}>
                    {m.content}
                  </div>
                </div>
                {m.actions && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {m.actions.map((a, j) => (
                      <button key={j} onClick={() => executeAction(a.action)}
                        className="px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-blue-50 hover:border-blue-200 transition-colors">
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-md p-3 shadow-sm">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="p-3 border-t border-gray-100 bg-white">
            <div className="flex gap-2">
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && send()}
                placeholder="พิมพ์คำสั่ง..." className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400"
              />
              <button onClick={send} disabled={loading || !input.trim()}
                className="px-3 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50">
                ➤
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
