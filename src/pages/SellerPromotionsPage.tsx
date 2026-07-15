import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { Link } from "react-router-dom";

interface Promotion {
  id: number; code: string; nameTh: string; description: string;
  type: string; value: number; minOrder: number; maxDiscount: number;
  usageLimit: number; usedCount: number; isActive: number;
}

const TYPE_LABELS: Record<string, string> = {
  percentage: "เปอร์เซ็นต์", fixed: "ลดราคา", free_shipping: "ส่งฟรี"
};

export default function SellerPromotionsPage() {
  const [items, setItems] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ code: "", nameTh: "", description: "", type: "percentage", value: 10, minOrder: 0, maxDiscount: 0, usageLimit: 0 });

  const load = () => {
    setLoading(true);
    apiClient("/api/promotions")
      .then(d => { setItems(d.items || []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const addPromo = async () => {
    if (!form.code) { alert("กรุณากรอกรหัส"); return; }
    try {
      const d = await apiClient("/api/promotions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (d.success) { setShowAdd(false); setForm({ code: "", nameTh: "", description: "", type: "percentage", value: 10, minOrder: 0, maxDiscount: 0, usageLimit: 0 }); setMsg("✅ เพิ่มโปรโมชั่นแล้ว"); load(); }
      else alert("❌ " + (d.error || "Error"));
    } catch { alert("เกิดข้อผิดพลาด"); }
  };

  const toggleStatus = async (id: number, current: number) => {
    try {
      await apiClient(`/api/promotions/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: current ? 0 : 1 }) });
      load();
    } catch {}
  };

  const deletePromo = async (id: number) => {
    if (!confirm("ยืนยันลบ?")) return;
    try {
      await apiClient(`/api/promotions/${id}`, { method: "DELETE" });
      setMsg("✅ ลบแล้ว"); load();
    } catch {}
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">🏷️ โปรโมชั่น/ส่วนลด</h1>
          <p className="text-sm text-gray-500">จัดการโค้ดส่วนลดสำหรับลูกค้า</p>
        </div>
        <div className="flex gap-2">
          <Link to="/seller" className="text-sm text-blue-600 hover:underline self-center">← กลับแดชบอร์ด</Link>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 font-medium">➕ เพิ่มโปรโมชั่น</button>
        </div>
      </div>

      {msg && <div className="mb-4 p-3 rounded-lg text-sm bg-blue-50 border border-blue-200 text-blue-700">{msg}</div>}

      {loading ? (
        <div className="text-center py-8 text-gray-400">กำลังโหลด...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border"><p className="text-gray-400">ยังไม่มีโปรโมชั่น</p></div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div class="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">รหัส</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">ชื่อ</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">ประเภท</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">มูลค่า</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">ใช้แล้ว</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">สถานะ</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-blue-50/50">
                  <td className="px-4 py-3 font-mono font-bold text-blue-700">{p.code}</td>
                  <td className="px-4 py-3">{p.nameTh}</td>
                  <td className="px-4 py-3 text-center text-xs">{TYPE_LABELS[p.type] || p.type}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {p.type === "percentage" ? `${p.value}%` : `฿${p.value}`}
                    {p.minOrder > 0 && <span className="text-xs text-gray-400 ml-1">(ขั้นต่ำ ฿{p.minOrder})</span>}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">{p.usedCount}/{p.usageLimit || "∞"}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleStatus(p.id, p.isActive)}
                      className={`px-2 py-0.5 rounded text-xs font-medium ${p.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {p.isActive ? "เปิด" : "ปิด"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => deletePromo(p.id)} className="px-3 py-1 bg-red-50 text-red-600 rounded text-xs hover:bg-red-100">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">เพิ่มโปรโมชั่น</h2>
            <div className="space-y-3">
              <input placeholder="รหัสส่วนลด (เช่น SALE10)" value={form.code} onChange={e => setForm({...form, code: e.target.value.toUpperCase()})} className="w-full px-3 py-2 border rounded-lg text-sm" />
              <input placeholder="ชื่อโปรโมชั่น" value={form.nameTh} onChange={e => setForm({...form, nameTh: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
              <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="percentage">เปอร์เซ็นต์ (%)</option>
                <option value="fixed">ลดราคา (บาท)</option>
                <option value="free_shipping">ส่งฟรี</option>
              </select>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">มูลค่า</label>
                  <input type="number" value={form.value} onChange={e => setForm({...form, value: +e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="text-xs text-gray-500">ยอดขั้นต่ำ</label>
                  <input type="number" value={form.minOrder} onChange={e => setForm({...form, minOrder: +e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={addPromo} className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700">✅ เพิ่ม</button>
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 bg-gray-100 rounded-xl font-medium hover:bg-gray-200">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
