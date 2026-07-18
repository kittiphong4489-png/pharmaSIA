import { useState, useRef, useEffect } from "react";
import { apiClient } from "../lib/api";

interface Message {
  text: string;
  from: "user" | "bot";
  confirmId?: string;
}

export default function SellerBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { text: "🤖 สวัสดีครับ! พิมพ์คำถามได้เลย\n\nพิมพ์ 'ช่วย' เพื่อดูคำสั่งทั้งหมด", from: "bot" },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [badge, setBadge] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Poll badge count
  useEffect(() => {
    const poll = () => apiClient("/api/seller/bot/badge").then(d => setBadge(d?.count || 0)).catch(() => {});
    poll();
    const t = setInterval(poll, 300000);
    return () => clearInterval(t);
  }, []);

  const send = async (text?: string, confirmId?: string) => {
    const q = (text || input).trim();
    if (!q && !confirmId) return;
    if (!confirmId) {
      setMessages(prev => [...prev, { text: q, from: "user" }]);
      setInput("");
    }
    setSending(true);
    try {
      const data = await apiClient("/api/seller/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, confirmId: confirmId || "" }),
      });
      setMessages(prev => [...prev, { 
        text: data?.reply || "ขออภัย เกิดข้อผิดพลาด", 
        from: "bot",
        confirmId: data?.confirmId 
      }]);
    } catch {
      setMessages(prev => [...prev, { text: "❌ ไม่สามารถเชื่อมต่อได้", from: "bot" }]);
    }
    setSending(false);
  };

  return (
    <>
      <button onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 text-white rounded-2xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center text-2xl relative"
      >
        {open ? "✕" : "🤖"}
        {badge > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col" style={{ maxHeight: "70vh" }}>
          <div className="px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-700 text-white font-semibold text-sm flex items-center gap-2">
            <span>🤖</span> ผู้ช่วยร้านค้า
            {badge > 0 && <span className="ml-auto bg-white/20 px-2 py-0.5 rounded-full text-xs">{badge} รอ</span>}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl whitespace-pre-wrap ${
                  m.from === "user"
                    ? "bg-green-600 text-white rounded-br-md"
                    : "bg-gray-100 text-gray-800 rounded-bl-md"
                }`}>
                  {m.text}
                  {/* Confirmation buttons */}
                  {m.confirmId && (
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => send("ใช่", m.confirmId)}
                        className="px-3 py-1 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700">✅ ใช่</button>
                      <button onClick={() => send("ไม่", m.confirmId)}
                        className="px-3 py-1 bg-red-100 text-red-600 text-xs rounded-lg hover:bg-red-200">❌ ไม่</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="border-t p-3 flex gap-2 bg-gray-50">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder="พิมพ์คำถาม..." 
              className="flex-1 px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" />
            <button onClick={() => send()} disabled={sending}
              className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm hover:bg-green-700 disabled:opacity-50">
              {sending ? "..." : "ส่ง"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
