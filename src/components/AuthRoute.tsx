import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { LogIn, Lock } from "lucide-react";
import { useState } from "react";

export default function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
        <div className="w-full max-w-sm text-center">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">กรุณาเข้าสู่ระบบ</h2>
          <p className="text-sm text-gray-500 mb-8">สมัครสมาชิกหรือเข้าสู่ระบบเพื่อดูสินค้าและสั่งซื้อ</p>

          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

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

          <p className="text-sm text-gray-500 mt-4">
            ยังไม่มีบัญชี? <Link to="/login" className="text-blue-600 font-medium hover:underline">สมัครสมาชิก</Link>
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
