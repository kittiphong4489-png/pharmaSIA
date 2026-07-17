import { useState, useRef, useEffect } from "react";
import { apiClient } from "../lib/api";

interface Message {
  text: string;
  from: "user" | "bot";
}

export default function SellerBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { text: "🤖 สวัสดีครับ! พิมพ์คำถามได้เลย\n\n· ออเดอร์ค้าง\n· ORD-xxx\n· ยอดขายวันนี้\n· สต็อกใกล้หมด\n· สินค้า xxx", from: "bot" },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    const q = input.trim();
    if (!q || sending) return;
    setMessages(prev => [...prev, { text: q, from: "user" }]);
    setInput("");
    setSending(true);
    try {
      const data = await apiClient("/api/seller/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      setMessages(prev => [...prev, { text: data?.reply || "ขออภัย เกิดข้อผิดพลาด", from: "bot" }]);
    } catch {
      setMessages(prev => [...prev, { text: "❌ ไม่สามารถเชื่อมต่อได้", from: "bot" }]);
    }
    setSending(false);
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 text-white rounded-2xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center text-2xl"
      >
        {open ? "✕" : "🤖"}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col" style={{ maxHeight: "70vh" }}>
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-700 text-white font-semibold text-sm flex items-center gap-2">
            <span>🤖</span> ผู้ช่วยร้านค้า
            <span className="ml-auto text-xs opacity-70">AI</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] px-3 py-2 rounded-2xl whitespace-pre-wrap ${
                  m.from === "user"
                    ? "bg-green-600 text-white rounded-br-md"
                    : "bg-gray-100 text-gray-800 rounded-bl-md"
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t p-3 flex gap-2 bg-gray-50">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder="พิมพ์คำถาม..."
              className="flex-1 px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              onClick={send}
              disabled={sending}
              className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm hover:bg-green-700 disabled:opacity-50"
            >
              {sending ? "..." : "ส่ง"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
