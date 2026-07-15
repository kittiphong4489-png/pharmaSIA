/**
 * src/pages/SellerCategoriesPage.tsx
 * จัดการหมวดหมู่สินค้า — แก้ไข, เรียงลำดับ, เพิ่ม/ลบ
 */
import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";

interface Category {
  id: number; nameTh: string; nameEn: string; slug: string;
  icon: string; color: string; sortOrder: number; productCount: number; isActive: number;
}

const COLORS = ["blue","green","amber","pink","teal","purple","orange","slate","yellow","gray","red","indigo","cyan","rose"];
const ICONS = ["📦","💊","🌿","✨","🧴","🩺","👶","🧹","☕","🐾","💄","🧪","🛡️","🎯","🧬","🔬"];

export default function SellerCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<Category>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newCat, setNewCat] = useState({ nameTh: "", nameEn: "", slug: "", icon: "📦", color: "blue" });

  const load = () => {
    setLoading(true);
    apiClient("/api/categories").then((d: any) => {
      const cats = (d.categories || d || []).filter((c: any) => c.sortOrder < 98);
      cats.sort((a: any, b: any) => a.sortOrder - b.sortOrder);
      setCategories(cats);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const showMsg = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 3000); };

  const saveEdit = async (id: number) => {
    try {
      const d = await apiClient(`/api/categories/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (d.success) { showMsg("✅ บันทึกแล้ว"); setEditingId(null); load(); }
    } catch {}
  };

  const moveUp = async (cat: Category, prev: Category | null) => {
    if (!prev) return;
    try {
      await apiClient(`/api/categories/${cat.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sortOrder: prev.sortOrder }) });
      await apiClient(`/api/categories/${prev.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sortOrder: cat.sortOrder }) });
      showMsg("✅ เรียงลำดับแล้ว"); load();
    } catch {}
  };

  const moveDown = async (cat: Category, next: Category | null) => {
    if (!next) return;
    await moveUp(next, cat);
  };

  const addCategory = async () => {
    if (!newCat.nameTh) { alert("กรุณากรอกชื่อหมวดหมู่"); return; }
    try {
      const d = await apiClient("/api/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newCat) });
      if (d.success) { showMsg("✅ เพิ่มหมวดหมู่แล้ว"); setShowAdd(false); setNewCat({ nameTh: "", nameEn: "", slug: "", icon: "📦", color: "blue" }); load(); }
    } catch {}
  };

  const deleteCat = async (id: number, name: string) => {
    if (!confirm(`ยืนยันลบหมวดหมู่ "${name}"? สินค้าจะย้ายไป "อื่นๆ/รอจัด"`)) return;
    try {
      const d = await apiClient(`/api/categories/${id}`, { method: "DELETE" });
      if (d.success) { showMsg("✅ ลบแล้ว"); load(); }
    } catch {}
  };

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-8 text-center text-gray-400">กำลังโหลด...</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">📂 จัดการหมวดหมู่</h1>
        <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 font-medium">
          ➕ เพิ่มหมวดหมู่
        </button>
      </div>

      {msg && <div className="mb-4 p-3 rounded-lg text-sm bg-blue-50 border border-blue-200 text-blue-700">{msg}</div>}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
              <th className="p-3 font-medium w-10">#</th>
              <th className="p-3 font-medium">ลำดับ</th>
              <th className="p-3 font-medium">หมวดหมู่</th>
              <th className="p-3 font-medium">สินค้า</th>
              <th className="p-3 font-medium">สถานะ</th>
              <th className="p-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat, i) => {
              const prev = i > 0 ? categories[i - 1] : null;
              const next = i < categories.length - 1 ? categories[i + 1] : null;
              return (
                <tr key={cat.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-3 text-lg">{cat.icon}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button onClick={() => moveUp(cat, prev)} disabled={!prev}
                        className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 text-xs">↑</button>
                      <button onClick={() => moveDown(cat, next)} disabled={!next}
                        className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 text-xs">↓</button>
                      <span className="text-gray-400 ml-1 text-xs self-center">{cat.sortOrder}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    {editingId === cat.id ? (
                      <div className="flex flex-col gap-2">
                        <input value={editForm.nameTh || ""} onChange={(e) => setEditForm({...editForm, nameTh: e.target.value})}
                          className="px-2 py-1 border rounded text-sm w-44" placeholder="ชื่อไทย" />
                        <input value={editForm.nameEn || ""} onChange={(e) => setEditForm({...editForm, nameEn: e.target.value})}
                          className="px-2 py-1 border rounded text-sm w-44" placeholder="ชื่ออังกฤษ" />
                        <div className="flex gap-2">
                          <select value={editForm.icon || cat.icon} onChange={(e) => setEditForm({...editForm, icon: e.target.value})}
                            className="px-2 py-1 border rounded text-sm">{ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}</select>
                          <select value={editForm.color || cat.color} onChange={(e) => setEditForm({...editForm, color: e.target.value})}
                            className="px-2 py-1 border rounded text-sm">{COLORS.map(cl => <option key={cl} value={cl}>{cl}</option>)}</select>
                        </div>
                      </div>
                    ) : (
                      <div className="font-medium">{cat.nameTh}{cat.nameEn ? ` (${cat.nameEn})` : ""}</div>
                    )}
                  </td>
                  <td className="p-3 text-gray-500">{cat.productCount}</td>
                  <td className="p-3">
                    {editingId === cat.id ? (
                      <select value={editForm.isActive ?? cat.isActive} onChange={(e) => setEditForm({...editForm, isActive: parseInt(e.target.value)})}
                        className="px-2 py-1 border rounded text-sm">
                        <option value={1}>แสดง</option>
                        <option value={0}>ซ่อน</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-xs ${cat.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {cat.isActive ? "แสดง" : "ซ่อน"}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      {editingId === cat.id ? (
                        <>
                          <button onClick={() => saveEdit(cat.id)} className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">บันทึก</button>
                          <button onClick={() => setEditingId(null)} className="px-3 py-1 bg-gray-100 rounded text-xs hover:bg-gray-200">ยกเลิก</button>
                        </>
                      ) : (
                        <button onClick={() => { setEditingId(cat.id); setEditForm(cat); }} className="px-3 py-1 bg-blue-50 text-blue-600 rounded text-xs hover:bg-blue-100">✏️</button>
                      )}
                      {!cat.nameTh.startsWith("อื่น") && (
                        <button onClick={() => deleteCat(cat.id, cat.nameTh)} className="px-3 py-1 bg-red-50 text-red-600 rounded text-xs hover:bg-red-100">🗑️</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e)=>e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">เพิ่มหมวดหมู่ใหม่</h2>
            <div className="space-y-3">
              <input placeholder="ชื่อไทย" value={newCat.nameTh}
                onChange={(e)=>setNewCat({...newCat, nameTh: e.target.value, slug: e.target.value.replace(/\s/g,'')})}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
              <input placeholder="ชื่ออังกฤษ" value={newCat.nameEn}
                onChange={(e)=>setNewCat({...newCat, nameEn: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
              <div className="flex gap-3">
                <select value={newCat.icon} onChange={(e)=>setNewCat({...newCat, icon: e.target.value})}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm">{ICONS.map(ic=><option key={ic} value={ic}>{ic}</option>)}</select>
                <select value={newCat.color} onChange={(e)=>setNewCat({...newCat, color: e.target.value})}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm">{COLORS.map(cl=><option key={cl} value={cl}>{cl}</option>)}</select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={addCategory} className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700">✅ เพิ่ม</button>
              <button onClick={()=>setShowAdd(false)} className="flex-1 py-2.5 bg-gray-100 rounded-xl font-medium hover:bg-gray-200">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
