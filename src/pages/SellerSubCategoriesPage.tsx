import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { Link } from "react-router-dom";

interface SubCategory {
  id: number; nameTh: string; nameEn: string; icon: string;
  categoryId: number; sortOrder: number; isActive: number;
  keywordPatterns: string; categoryName?: string;
}
interface Category {
  id: number; nameTh: string; icon: string;
}

export default function SellerSubCategoriesPage() {
  const [subs, setSubs] = useState<SubCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ nameTh: "", icon: "💊", sortOrder: 0, keywordPatterns: "", categoryId: 1 });
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ nameTh: "", icon: "💊", sortOrder: 0, keywordPatterns: "", categoryId: 1 });
  const [assignResult, setAssignResult] = useState<any>(null);
  const [assignLoading, setAssignLoading] = useState(false);

  const load = () => {
    Promise.all([
      apiClient("/api/sub-categories"),
      apiClient("/api/categories"),
    ]).then(([s, c]) => {
      setSubs(s || []);
      setCategories(c.filter((cat: any) => cat.isActive));
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    const data = await apiClient("/api/sub-categories", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    if (data.success) { setShowAdd(false); setAddForm({ nameTh: "", icon: "💊", sortOrder: 0, keywordPatterns: "", categoryId: 1 }); load(); }
  };

  const handleEdit = (s: SubCategory) => {
    setEditingId(s.id);
    setEditForm({ nameTh: s.nameTh, icon: s.icon, sortOrder: s.sortOrder, keywordPatterns: s.keywordPatterns || "", categoryId: s.categoryId });
  };

  const handleSave = async () => {
    await apiClient(`/api/sub-categories/${editingId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setEditingId(null);
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("ยืนยันลบหมวดย่อยนี้?")) return;
    await apiClient(`/api/sub-categories/${id}`, { method: "DELETE" });
    load();
  };

  const handleAssign = async (catId: number) => {
    setAssignLoading(true);
    setAssignResult(null);
    const data = await apiClient("/api/sub-categories/assign", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: catId, dryRun: false }),
    });
    setAssignResult({ ...data, catId });
    setAssignLoading(false);
    load();
  };

  const iconOptions = ["💊","🤧","🫃","🩹","🩸","🧊","👁️","✨","🌿","🧴","🩺","🧹","☕","🐾","📦"];

  if (loading) return <div className="text-center py-8 text-gray-400">กำลังโหลด...</div>;

  // Group by category
  const grouped: Record<number, SubCategory[]> = {};
  for (const s of subs) {
    if (!grouped[s.categoryId]) grouped[s.categoryId] = [];
    grouped[s.categoryId].push(s);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">จัดการหมวดหมู่ย่อย</h1>
        <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          ➕ เพิ่มหมวดย่อย
        </button>
      </div>

      {/* Assign Result */}
      {assignResult && (
        <div className="mb-4 p-3 rounded-lg text-sm bg-blue-50 border border-blue-200">
          🎯 จัดหมวดสำเร็จ! {assignResult.assigned} จาก {assignResult.totalProducts} รายการ (เหลือ {assignResult.remaining})
        </div>
      )}

      {/* Category Groups */}
      {categories.map(cat => (
        <div key={cat.id} className="mb-6 bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
            <h2 className="font-semibold text-gray-800">{cat.icon} {cat.nameTh}</h2>
            <button onClick={() => handleAssign(cat.id)} disabled={assignLoading}
              className="px-3 py-1 bg-green-50 text-green-600 rounded-lg text-xs hover:bg-green-100">
              {assignLoading ? "⏳ กำลังจัด..." : "🔄 จัดหมวดอัตโนมัติ"}
            </button>
          </div>

          {grouped[cat.id]?.length > 0 ? (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-gray-500">
                <th className="px-4 py-2 font-medium">ไอคอน</th>
                <th className="px-4 py-2 font-medium">ชื่อหมวดย่อย</th>
                <th className="px-4 py-2 font-medium">Keyword</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr></thead>
              <tbody>
                {grouped[cat.id].map(s => (
                  <tr key={s.id} className="border-b hover:bg-gray-50">
                    {editingId === s.id ? (
                      <>
                        <td className="px-4 py-2">
                          <select value={editForm.icon} onChange={e => setEditForm({...editForm, icon: e.target.value})}
                            className="w-16 text-lg border rounded px-1">
                            {iconOptions.map(ic => <option key={ic} value={ic}>{ic}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input value={editForm.nameTh} onChange={e => setEditForm({...editForm, nameTh: e.target.value})}
                            className="w-full px-2 py-1 border rounded" />
                        </td>
                        <td className="px-4 py-2">
                          <input value={editForm.keywordPatterns} onChange={e => setEditForm({...editForm, keywordPatterns: e.target.value})}
                            className="w-full px-2 py-1 border rounded text-xs" placeholder="keyword1,keyword2" />
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <button onClick={handleSave} className="px-3 py-1 bg-blue-600 text-white rounded text-xs">บันทึก</button>
                            <button onClick={() => setEditingId(null)} className="px-3 py-1 bg-gray-100 rounded text-xs">ยกเลิก</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-lg">{s.icon}</td>
                        <td className="px-4 py-2 font-medium">{s.nameTh}</td>
                        <td className="px-4 py-2 text-xs text-gray-400 font-mono">{(s.keywordPatterns || "").substring(0, 40)}{(s.keywordPatterns || "").length > 40 ? "..." : ""}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <button onClick={() => handleEdit(s)} className="px-3 py-1 bg-blue-50 text-blue-600 rounded text-xs hover:bg-blue-100">แก้ไข</button>
                            <button onClick={() => handleDelete(s.id)} className="px-3 py-1 bg-red-50 text-red-600 rounded text-xs hover:bg-red-100">ลบ</button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">
              ยังไม่มีหมวดย่อย — กด "จัดหมวดอัตโนมัติ" หรือเพิ่มเอง
            </div>
          )}
        </div>
      ))}

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">เพิ่มหมวดย่อย</h2>
            <div className="space-y-3">
              <select value={addForm.categoryId} onChange={e => setAddForm({...addForm, categoryId: +e.target.value})}
                className="w-full px-3 py-2 border rounded-lg">
                {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.nameTh}</option>)}
              </select>
              <input placeholder="ชื่อ (เช่น ยาแก้ปวด)" value={addForm.nameTh}
                onChange={e => setAddForm({...addForm, nameTh: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
              <select value={addForm.icon} onChange={e => setAddForm({...addForm, icon: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg text-lg">
                {iconOptions.map(ic => <option key={ic} value={ic}>{ic}</option>)}
              </select>
              <input placeholder="Keyword (คั่นด้วย ,)" value={addForm.keywordPatterns}
                onChange={e => setAddForm({...addForm, keywordPatterns: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg text-xs" />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleAdd} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700">✅ เพิ่ม</button>
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 bg-gray-100 rounded-xl hover:bg-gray-200">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
