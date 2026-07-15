import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { Link } from "react-router-dom";
import Pagination from "../components/Pagination";

interface ShippingRate {
  id: number;
  name: string;
  minWeight: number;
  maxWeight: number;
  fee: number;
  isActive: number;
}

export default function SellerShippingPage() {
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", minWeight: 0, maxWeight: 0, fee: 0 });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", minWeight: 0, maxWeight: 0, fee: 0 });
  const [settings, setSettings] = useState({ freeThreshold: 500, discountPercent: 0, discountEnabled: "false" });

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient("/api/shipping/rates"),
    ]).then(([d]) => {
      setRates(d.rates || []); setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const addRate = async () => {
    if (!form.name || form.fee <= 0) { alert("กรุณากรอกข้อมูล"); return; }
    try {
      const d = await apiClient("/api/shipping/rates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (d.success) { setShowAdd(false); setForm({ name: "", minWeight: 0, maxWeight: 0, fee: 0 }); setMsg("✅ เพิ่มอัตราค่าส่งแล้ว"); load(); }
      else alert("❌ " + (d.error || "Error"));
    } catch { alert("เกิดข้อผิดพลาด"); }
  };

  const updateRate = async (id: number) => {
    try {
      const d = await apiClient(`/api/shipping/rates/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (d.success) { setEditingId(null); setMsg("✅ แก้ไขแล้ว"); load(); }
      else alert("❌ " + (d.error || "Error"));
    } catch { alert("เกิดข้อผิดพลาด"); }
  };

  const deleteRate = async (id: number) => {
    if (!confirm("ยืนยันลบ?")) return;
    try {
      const d = await apiClient(`/api/shipping/rates/${id}`, { method: "DELETE" });
      if (d.success) { setMsg("✅ ลบแล้ว"); load(); }
      else alert("❌ " + (d.error || "Error"));
    } catch { alert("เกิดข้อผิดพลาด"); }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">🚚 ตั้งค่าการจัดส่ง</h1>
          <p className="text-sm text-gray-500">กำหนดอัตราค่าส่งตามน้ำหนัก</p>
        </div>
        <div className="flex gap-2">
          <Link to="/seller" className="text-sm text-blue-600 hover:underline self-center">← กลับแดชบอร์ด</Link>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 font-medium">
            ➕ เพิ่มช่วงราคา
          </button>
        </div>
      </div>

      {msg && <div className="mb-4 p-3 rounded-lg text-sm bg-blue-50 border border-blue-200 text-blue-700">{msg}</div>}

      {loading ? (
        <div className="text-center py-8 text-gray-400">กำลังโหลด...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div class="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">ชื่อช่วง</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">น้ำหนักต่ำสุด (g)</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">น้ำหนักสูงสุด (g)</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">ค่าส่ง (฿)</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors">
                  {editingId === r.id ? (
                    <>
                      <td className="px-4 py-2"><input value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full px-2 py-1 border rounded text-xs" /></td>
                      <td className="px-4 py-2 text-center"><input type="number" value={editForm.minWeight} onChange={e => setEditForm({...editForm, minWeight: +e.target.value})} className="w-20 px-2 py-1 border rounded text-xs text-center" /></td>
                      <td className="px-4 py-2 text-center"><input type="number" value={editForm.maxWeight} onChange={e => setEditForm({...editForm, maxWeight: +e.target.value})} className="w-20 px-2 py-1 border rounded text-xs text-center" /></td>
                      <td className="px-4 py-2 text-center"><input type="number" value={editForm.fee} onChange={e => setEditForm({...editForm, fee: +e.target.value})} className="w-20 px-2 py-1 border rounded text-xs text-center" /></td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => updateRate(r.id)} className="px-2 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">บันทึก</button>
                        <button onClick={() => setEditingId(null)} className="ml-1 px-2 py-1 bg-gray-100 rounded text-xs hover:bg-gray-200">ยกเลิก</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-medium">{r.name}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{r.minWeight.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{r.maxWeight.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center font-medium text-green-700">{r.fee} ฿</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => { setEditingId(r.id); setEditForm({ name: r.name, minWeight: r.minWeight, maxWeight: r.maxWeight, fee: r.fee }); }}
                          className="px-3 py-1 bg-blue-50 text-blue-600 rounded text-xs hover:bg-blue-100">✏️</button>
                        <button onClick={() => deleteRate(r.id)} className="ml-1 px-3 py-1 bg-red-50 text-red-600 rounded text-xs hover:bg-red-100">🗑️</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl p-6 sm:max-w max-w-full sm:rounded-2xl rounded-none sm:mx-4 mx-0-md w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">เพิ่มอัตราค่าส่ง</h2>
            <div className="space-y-3">
              <input placeholder="ชื่อช่วง (เช่น 0-500g)" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">น้ำหนักต่ำสุด (g)</label>
                  <input type="number" value={form.minWeight} onChange={e => setForm({...form, minWeight: +e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="text-xs text-gray-500">น้ำหนักสูงสุด (g)</label>
                  <input type="number" value={form.maxWeight} onChange={e => setForm({...form, maxWeight: +e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
              <div><label className="text-xs text-gray-500">ค่าส่ง (บาท)</label>
                <input type="number" value={form.fee} onChange={e => setForm({...form, fee: +e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={addRate} className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700">✅ เพิ่ม</button>
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 bg-gray-100 rounded-xl font-medium hover:bg-gray-200">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl p-5 border border-orange-100">
        <h3 className="font-semibold text-gray-800 mb-2 text-sm">💡 วิธีคำนวณค่าส่ง</h3>
        <p className="text-xs text-gray-500">ระบบคำนวณค่าส่งตามน้ำหนักรวมของสินค้าในออเดอร์ โดยเลือกช่วงน้ำหนักที่ตรงกับน้ำหนักรวมมากที่สุด</p>
      </div>
    </div>
  );
}
