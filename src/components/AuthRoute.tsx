import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { LogIn, Lock, UserPlus } from "lucide-react";
import { useState } from "react";

export default function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
        <div className="w-full max-w-sm">
          {/* Icon + Title */}
          <div className="text-center mb-6">
            <div className={`w-14 h-14 ${mode === "login" ? "bg-blue-600" : "bg-green-600"} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
              {mode === "login" ? <LogIn className="w-7 h-7 text-white" /> : <UserPlus className="w-7 h-7 text-white" />}
            </div>
            <h2 className="text-xl font-bold text-gray-900">{mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}</h2>
            <p className="text-sm text-gray-500 mt-1">
              {mode === "login" ? "เข้าสู่ระบบเพื่อดูสินค้าและสั่งซื้อ" : "สร้างบัญชีใหม่เพื่อเริ่มสั่งซื้อ"}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
            <button onClick={() => { setMode("login"); setError(""); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${mode === "login" ? "bg-white shadow text-gray-900" : "text-gray-500"}`}>
              เข้าสู่ระบบ
            </button>
            <button onClick={() => { setMode("register"); setError(""); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${mode === "register" ? "bg-white shadow text-gray-900" : "text-gray-500"}`}>
              สมัครสมาชิก
            </button>
          </div>

          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>}

          {/* Login Form */}
          {mode === "login" && (
            <form onSubmit={async (e) => {
              e.preventDefault(); setError("");
              const r = await login(email, password);
              if (!r.success) setError(r.error || "เข้าสู่ระบบล้มเหลว");
            }} className="space-y-3 text-left">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="your@email.com" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••••" required />
              </div>
              <button type="submit" className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors text-sm">
                เข้าสู่ระบบ
              </button>
            </form>
          )}

          {/* Register Form */}
          {mode === "register" && (
            <form onSubmit={async (e) => {
              e.preventDefault(); setError(""); setSuccess("");
              if (password.length < 6) { setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"); return; }
              const r = await register(email, password, fullName, phone);
              if (r.success) {
                setSuccess("✅ สมัครสมาชิกสำเร็จ! กำลังเข้าสู่ระบบ...");
              } else {
                setError(r.error || "สมัครสมาชิกล้มเหลว");
              }
            }} className="space-y-3 text-left">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="your@email.com" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ-นามสกุล *</label>
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="คุณสมชาย ใจดี" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="0812345678" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน *</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="ขั้นต่ำ 6 ตัวอักษร" required minLength={6} />
              </div>
              <button type="submit" className="w-full py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors text-sm">
                สมัครสมาชิก
              </button>
            </form>
          )}

          <p className="text-sm text-gray-400 text-center mt-6">
            <Link to="/" className="text-gray-500 hover:underline">← กลับหน้าแรก</Link>
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
