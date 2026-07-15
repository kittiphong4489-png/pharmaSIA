import { useEffect, useState, useRef } from "react";
import { apiClient } from "../lib/api";

interface Session {
  id: number; sessionToken: string; customerName: string;
  customerPhone: string; lastMessage: string; isRead: number;
  lastMessageAt: string; msgCount: number;
}
interface Message {
  id: number; role: string; content: string;
  senderName: string; createdAt: string;
}

export default function SellerChatCenterPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const loadSessions = async () => {
    const data = await apiClient("/api/chat/sessions");
    setSessions(data || []);
  };

  const selectSession = async (s: Session) => {
    const data = await apiClient(`/api/chat/sessions/${s.id}`);
    setSelected(s);
    setMessages(data.messages || []);
    loadSessions(); // Refresh to mark as read
  };

  const sendReply = async () => {
    if (!reply.trim() || !selected || sending) return;
    setSending(true);
    await apiClient(`/api/chat/sessions/${selected.id}/reply`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: reply }),
    });
    setReply("");
    setSending(false);
    selectSession(selected); // Refresh messages
  };

  useEffect(() => { loadSessions(); const t = setInterval(loadSessions, 15000); return () => clearInterval(t); }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 flex gap-6 h-[calc(100vh-12rem)]">
      {/* Left: Session List */}
      <div className="w-80 bg-white rounded-xl border flex flex-col overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white font-semibold">
          💬 กล่องข้อความลูกค้า ({sessions.length})
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">ยังไม่มีข้อความ</div>
          ) : sessions.map(s => (
            <div key={s.id} onClick={() => selectSession(s)}
              className={`px-4 py-3 border-b cursor-pointer hover:bg-gray-50 transition ${selected?.id === s.id ? "bg-green-50 border-l-4 border-l-green-600" : ""} ${!s.isRead ? "font-semibold" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm">{s.customerName}</span>
                {!s.isRead && <span className="w-2.5 h-2.5 bg-red-500 rounded-full" />}
              </div>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{s.lastMessage}</p>
              <p className="text-xs text-gray-300 mt-0.5">{s.msgCount} ข้อความ</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Chat View */}
      <div className="flex-1 bg-white rounded-xl border flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            เลือกข้อความทางซ้ายเพื่อเริ่มตอบ
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">{selected.customerName}</p>
                {selected.customerPhone && <p className="text-xs text-gray-500">{selected.customerPhone}</p>}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.role === "customer" ? "justify-start" : "justify-end"}`}>
                  <div className="max-w-[70%]">
                    <p className="text-xs text-gray-400 mb-1">{m.senderName} · {new Date(m.createdAt).toLocaleTimeString("th-TH")}</p>
                    <div className={`px-4 py-2 rounded-2xl text-sm ${
                      m.role === "customer"
                        ? "bg-gray-100 text-gray-800 rounded-bl-md"
                        : "bg-green-600 text-white rounded-br-md"
                    }`}>
                      {m.content}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply */}
            <div className="border-t p-3 bg-gray-50 flex gap-2">
              <input value={reply} onChange={e => setReply(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendReply()}
                placeholder="พิมพ์ตอบ..." 
                className="flex-1 px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" />
              <button onClick={sendReply} disabled={sending}
                className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm hover:bg-green-700">
                {sending ? "ส่ง..." : "ส่ง"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
