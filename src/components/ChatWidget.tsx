import { useState, useRef, useEffect } from "react";
import { apiClient } from "../lib/api";

interface ChatMsg { role: "user" | "bot"; content: string; }

const WELCOME = `💊 **สอบถามเภสัชกรได้เลยครับ!**
เราพร้อมตอบคำถามเรื่องยา สินค้า ราคา หรือคำแนะนำต่างๆ

พิมพ์คำถามของคุณด้านล่างได้เลย 🚀`;

function getSessionToken() {
  try { return localStorage.getItem("chat_session"); } catch { return null; }
}
function setSessionToken(tok: string) {
  try { localStorage.setItem("chat_session", tok); } catch {}
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([{ role: "bot", content: WELCOME }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [registered, setRegistered] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const sendMsg = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput("");

    // First message = register
    if (!registered) {
      if (!name.trim() || !phone.trim()) {
        setMsgs(p => [...p, { role: "bot", content: "กรุณากรอก *ชื่อ* และ *เบอร์โทร* ก่อนเริ่มแชทนะครับ 😊" }]);
        return;
      }
      setRegistered(true);
    }

    setMsgs(p => [...p, { role: "user", content: msg }]);
    setSending(true);

    try {
      const data = await apiClient("/api/chat/customer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          sessionToken: getSessionToken(),
          customerName: name || "ลูกค้า",
          customerPhone: phone || "",
        }),
      });
      if (data?.sessionToken) setSessionToken(data.sessionToken);
      setMsgs(p => [...p, {
        role: "bot",
        content: data?.reply || "✅ ส่งข้อความถึงเภสัชกรแล้วครับ เราจะตอบกลับเร็วๆ นี้!",
      }]);
    } catch {
      setMsgs(p => [...p, { role: "bot", content: "❌ ส่งไม่สำเร็จ กรุณาลองใหม่" }]);
    }
    setSending(false);
  };

  return (
    <>
      {/* Button */}
      <button onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-green-500 to-green-700 rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center hover:scale-105 group">
        {!open && <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center animate-pulse">1</span>}
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 max-h-[500px] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-green-600 to-green-700 px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl">💊</div>
            <div>
              <p className="text-white font-semibold text-sm">PharmaSIA</p>
              <p className="text-green-100 text-xs">สอบถามเภสัชกร</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ maxHeight: 280 }}>
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-green-600 text-white rounded-br-md"
                    : "bg-gray-100 text-gray-800 rounded-bl-md"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-gray-100 px-4 py-2 rounded-2xl rounded-bl-md text-sm text-gray-400">
                  กำลังส่ง...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t bg-gray-50 p-3">
            {!registered && (
              <div className="flex gap-2 mb-2">
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="ชื่อคุณ" className="flex-1 px-2 py-1.5 border rounded-lg text-xs" />
                <input value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="เบอร์โทร" className="w-24 px-2 py-1.5 border rounded-lg text-xs" />
              </div>
            )}
            <div className="flex gap-2">
              <input value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendMsg()}
                placeholder="พิมพ์ข้อความ..." 
                className="flex-1 px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" />
              <button onClick={sendMsg} disabled={sending}
                className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                ส่ง
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
