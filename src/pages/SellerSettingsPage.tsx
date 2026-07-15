import { useEffect, useState } from "react";
import { useSettings } from "../contexts/SettingsContext";
import { apiClient } from "../lib/api";

interface StoreSettings {
  storeName: string;
  storeNameTh: string;
  storeAddress: string;
  storePhone: string;
  storeEmail: string;
  taxId: string;
  logoUrl: string;
  lineId: string;
  facebookUrl: string;
  invoicePrefix: string;
  footer: string;
}

export default function SellerSettingsPage() {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { refreshSettings } = useSettings();

  const getToken = () => localStorage.getItem("pharma_token");

  useEffect(() => {
    const token = getToken();
    apiClient("/api/seller/settings", { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      
      .then((data) => {
        setSettings(data.settings);
        setForm(data.settings || {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const token = getToken();
    try {
      const data = await apiClient("/api/seller/settings", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      if (data.success) {
        setSettings(data.settings);
        setSaved(true);
        refreshSettings();
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (e: any) {
      alert("❌ บันทึกไม่สำเร็จ: " + (e?.message || "กรุณาลองใหม่อีกครั้ง"));
      console.error("[Settings] Save error:", e);
    }
    setSaving(false);
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const token = getToken();
    const formData = new FormData();
    formData.append("image", file);
    try {
      const res = await fetch("/api/upload/image", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (data.url) setForm(prev => ({ ...prev, logoUrl: data.url }));
    } catch { alert("อัปโหลดรูปไม่สำเร็จ"); }
  };

  if (loading) return <div className="max-w-2xl mx-auto px-4 py-8 text-center text-gray-400">กำลังโหลด...</div>;

  const fields = [
    { key: "storeNameTh", label: "ชื่อร้าน (ไทย)", type: "text" },
    { key: "storeName", label: "ชื่อร้าน (อังกฤษ)", type: "text" },
    { key: "storeAddress", label: "ที่อยู่ร้าน", type: "textarea" },
    { key: "storePhone", label: "เบอร์โทรร้าน", type: "text" },
    { key: "storeEmail", label: "อีเมลร้าน", type: "email" },
    { key: "taxId", label: "เลขประจำตัวผู้เสียภาษี", type: "text" },
    { key: "logoUrl", label: "โลโก้ร้าน", type: "logo" },
    { key: "lineId", label: "LINE ID", type: "text" },
    { key: "facebookUrl", label: "Facebook Page", type: "text" },
    { key: "promptpayPhone", label: "เบอร์พร้อมเพย์ (PromptPay)", type: "text" },
    { key: "invoicePrefix", label: "เลขนำหน้าใบเสร็จ", type: "text" },
    { key: "footer", label: "ข้อความท้ายใบเสร็จ", type: "text" },
  ];

  const [lineToken, setLineToken] = useState("");
  const [lineStatus, setLineStatus] = useState<"loading"|"ok"|"missing">("loading");

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-gray-900 mb-2">ตั้งค่าร้านค้า</h1>
      <p className="text-sm text-gray-500 mb-6">ข้อมูลเหล่านี้จะแสดงบนหน้าเว็บและใบเสร็จ</p>

      {saved && <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">✅ บันทึกแล้ว</div>}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
            {f.type === "textarea" ? (
              <textarea value={form[f.key] || ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" rows={3} />
            ) : f.type === "logo" ? (
              <div className="space-y-2">
                {form.logoUrl && (
                  <img src={form.logoUrl} alt="Logo preview"
                    className="w-20 h-20 object-contain rounded-lg border border-gray-200 mb-2"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                )}
                <div className="flex flex-col sm:flex-row gap-2">
                  <input type="file" accept="image/*" onChange={handleUploadLogo}
                    className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                  <input type="text" value={form.logoUrl || ""} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                    placeholder="หรือวาง URL รูป"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
            ) : (
              <input type={f.type} value={form[f.key] || ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            )}
          </div>
        ))}

        <button onClick={handleSave} disabled={saving}
          className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
        </button>
      </div>

      {/* Telegram Notification Section */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-2">🤖 แจ้งเตือน Telegram</h2>
        <p className="text-sm text-gray-500 mb-4">รับแจ้งเตือนออเดอร์ใหม่ผ่าน Telegram Bot (ตั้งค่าใน Railway Environment)</p>
        
        <div className="space-y-3">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-sm font-medium text-blue-800">✅ Telegram Bot กำลังทำงาน</p>
            <p className="text-xs text-blue-600 mt-1">Bot: @PharmaSIAordar_bot</p>
            <p className="text-xs text-blue-600">Chat ID: 8308720014</p>
          </div>
          
          <button onClick={async () => {
            try {
              const d = await apiClient("/api/telegram/notify", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: "🛎 *ทดสอบการแจ้งเตือน*\n\n✅ ระบบ Telegram พร้อมทำงานแล้ว! 🚀" }),
              });
              if (d.success) alert("✅ ส่งข้อความทดสอบไปที่ Telegram แล้ว");
              else alert("❌ " + (d.error || "ส่งไม่สำเร็จ"));
            } catch { alert("เกิดข้อผิดพลาด"); }
          }} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            ทดสอบส่ง Telegram 📨
          </button>

          <details className="text-xs text-gray-500 mt-3">
            <summary className="cursor-pointer text-blue-600 hover:underline">วิธีตั้งค่า Telegram Bot</summary>
            <ol className="mt-2 space-y-1 pl-4 list-decimal">
              <li>พิมพ์ @BotFather ใน Telegram → /newbot</li>
              <li>ตั้งชื่อ Bot → ได้ TELEGRAM_BOT_TOKEN</li>
              <li>ส่งข้อความหา Bot → /getUpdates → ได้ CHAT_ID</li>
              <li>ตั้งค่าใน Railway: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID</li>
            </ol>
          </details>
        </div>
      </div>
    </div>
  );
}
