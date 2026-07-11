import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { User, Store, LogIn, Eye, EyeOff } from "lucide-react";
import { apiClient } from "../lib/api";

export default function LoginPage() {
  const { login, register, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [tier, setTier] = useState<"INDIVIDUAL" | "RETAIL_STORE">("INDIVIDUAL");
  const [storeName, setStoreName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);
  // Validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validatePhone = (val: string): boolean => {
    const cleaned = val.replace(/[\s-]/g, "");
    return /^0[0-9]{9}$/.test(cleaned);
  };

  const switchTier = (newTier: "INDIVIDUAL" | "RETAIL_STORE") => {
    setTier(newTier);
    // Clear store-specific fields when switching
    setStoreName("");
    setOwnerName("");
    setStorePhone("");
    setTaxId("");
    setAddress("");
    setFieldErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    const errors: Record<string, string> = {};

    if (mode === "register") {
      if (!email) errors.email = "กรุณากรอกอีเมล";
      if (!password || password.length < 6) errors.password = "รหัสผ่านต้องมีอย่างน้อย 6 ตัว";
      if (tier === "INDIVIDUAL") {
        if (!fullName) errors.fullName = "กรุณากรอกชื่อ-นามสกุล";
      }
      if (!phone) errors.phone = "กรุณากรอกเบอร์โทรศัพท์";
      else if (!validatePhone(phone)) errors.phone = "รูปแบบเบอร์โทรไม่ถูกต้อง (เช่น 081-234-5678)";
      if (tier === "RETAIL_STORE" && !storePhone) errors.storePhone = "กรุณากรอกเบอร์โทรศัพท์ร้านค้า";
    } else {
      if (!email) errors.email = "กรุณากรอกอีเมล";
      if (!password) errors.password = "กรุณากรอกรหัสผ่าน";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const name = tier === "RETAIL_STORE" ? storeName : fullName;
      const extraPhone = tier === "RETAIL_STORE" ? storePhone : "";
      const extraName = tier === "RETAIL_STORE" ? ownerName : "";
      const result = mode === "login"
        ? await login(email, password)
        : await register(email, password, name, phone, tier, taxId, address, extraName, extraPhone);
      if (result.success) {
        navigate("/");
      } else {
        setError(result.error || "เกิดข้อผิดพลาด");
      }
    } catch (e: any) {
      setError(e?.message || "เกิดข้อผิดพลาด");
    }
    setSubmitting(false);
  };

  const handleResetPassword = async () => {
    if (!resetEmail) { setResetMsg("กรุณากรอกอีเมล"); return; }
    setResetSubmitting(true);
    try {
      const d = await apiClient("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: resetEmail }),
      });
      if (d.success) {
        setResetMsg("✅ กรุณาตรวจสอบอีเมลของคุณ");
      } else {
        setResetMsg("❌ " + (d.error || "ไม่สามารถส่งอีเมลรีเซ็ตรหัสผ่านได้"));
      }
    } catch {
      setResetMsg("❌ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    }
    setResetSubmitting(false);
  };

  return (
    <div className="min-h-screen px-4 py-12">
      <div className="w-full max-w-sm mx-auto">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-bold text-xl">P</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            {showForgotPassword ? "ลืมรหัสผ่าน" : mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {showForgotPassword ? "ป้อนอีเมลเพื่อรีเซ็ตรหัสผ่าน" : mode === "login" ? "เข้าสู่ระบบเพื่อสั่งซื้อสินค้า" : "สมัครฟรี ไม่มีค่าใช้จ่าย"}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        {showForgotPassword ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
              <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="your@email.com" />
            </div>
            {resetMsg && <p className={`text-sm ${resetMsg.includes("✅") ? "text-green-600" : "text-red-600"}`}>{resetMsg}</p>}
            <button onClick={handleResetPassword} disabled={resetSubmitting}
              className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm">
              {resetSubmitting ? "กำลังดำเนินการ..." : "ส่งอีเมลรีเซ็ตรหัสผ่าน"}
            </button>
            <p className="text-center text-sm text-gray-500">
              <button type="button" onClick={() => { setShowForgotPassword(false); setResetMsg(""); }}
                className="text-blue-600 hover:text-blue-700 font-medium">กลับไปหน้าเข้าสู่ระบบ</button>
            </p>
          </div>
        ) : (
          <>
            {mode === "register" && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">ประเภทสมาชิก</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => switchTier("INDIVIDUAL")}
                    className={`p-3 rounded-lg border text-sm font-medium text-center transition-all ${tier === "INDIVIDUAL" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                    <User className={`w-5 h-5 mx-auto mb-1 ${tier === "INDIVIDUAL" ? "text-blue-600" : "text-gray-400"}`} />
                    บุคคลทั่วไป
                  </button>
                  <button type="button" onClick={() => switchTier("RETAIL_STORE")}
                    className={`p-3 rounded-lg border text-sm font-medium text-center transition-all ${tier === "RETAIL_STORE" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                    <Store className={`w-5 h-5 mx-auto mb-1 ${tier === "RETAIL_STORE" ? "text-blue-600" : "text-gray-400"}`} />
                    ร้านค้าทั่วไป
                  </button>
                </div>
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSubmit} noValidate>
              {mode === "register" && tier === "INDIVIDUAL" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ-นามสกุล</label>
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ชื่อ นามสกุล" required />
                  {fieldErrors.fullName && <p className="text-xs text-red-500 mt-1">{fieldErrors.fullName}</p>}
                </div>
              )}
              {mode === "register" && tier === "RETAIL_STORE" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อร้านค้า</label>
                    <input type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="ชื่อร้านค้า" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อเจ้าของร้าน</label>
                    <input type="text" value={ownerName} onChange={(e) => setOwnerName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="ชื่อ-นามสกุล เจ้าของร้าน" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์ร้านค้า <span className="text-red-500">*</span></label>
                    <input type="tel" value={storePhone} onChange={(e) => setStorePhone(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="เบอร์ร้านค้า" required />
                    {fieldErrors.storePhone && <p className="text-xs text-red-500 mt-1">{fieldErrors.storePhone}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">เลขผู้เสียภาษี (ถ้ามี)</label>
                    <input type="text" value={taxId} onChange={(e) => setTaxId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="13 หลัก (ไม่บังคับ)" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ที่อยู่ร้านค้า</label>
                    <textarea value={address} onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3} placeholder="ที่อยู่ร้านค้า" />
                  </div>
                </> 
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="your@email.com" required />
                {fieldErrors.email && <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>}
              </div>
              {mode === "register" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์ <span className="text-red-500">*</span></label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="081-XXX-XXXX" required />
                  {fieldErrors.phone && <p className="text-xs text-red-500 mt-1">{fieldErrors.phone}</p>}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน</label>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="••••••••" required minLength={6} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.password && <p className="text-xs text-red-500 mt-1">{fieldErrors.password}</p>}
              </div>
              {mode === "login" && (
                <div className="text-right">
                  <button type="button" onClick={() => setShowForgotPassword(true)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                    ลืมรหัสผ่าน?
                  </button>
                </div>
              )}
              <button type="submit" disabled={submitting}
                className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm">
                {submitting ? "กำลังดำเนินการ..." : mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
              </button>
            </form>

            <p className="text-center text-sm text-gray-500 mt-6">
              {mode === "login" ? "ยังไม่มีบัญชี?" : "มีบัญชีแล้ว?"}
              <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
                className="text-blue-600 hover:text-blue-700 font-medium ml-1">
                {mode === "login" ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
