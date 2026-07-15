import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../lib/api";
import type { Product, Category } from "../types";
import Pagination from "../components/Pagination";

export default function SellerProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ nameTh: "", nameEn: "", price: 0, costPrice: 0, stock: 0, status: "active", categoryId: 1 });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Add product
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ sku: "", nameTh: "", nameEn: "", price: 0, costPrice: 0, stock: 0, categoryId: 1 });

  // Category management
  const [showCatModal, setShowCatModal] = useState(false);
  const [catForm, setCatForm] = useState({ nameTh: "", nameEn: "", slug: "", icon: "📦", color: "blue" });

  const loadProducts = () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50", page: String(page) });
    if (catFilter) params.set("categoryId", catFilter);
    if (search) params.set("search", search);
    Promise.all([
      apiClient(`/api/admin/products?${params}`),
      apiClient("/api/categories"),
    ]).then(([data, cats]) => {
      setProducts(data.items || []);
      setTotalPages(data.totalPages || 1);
      setCategories(cats || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { loadProducts(); }, [catFilter, page]);

  const handleEdit = (p: Product) => {
    setEditingId(p.id);
    setEditForm({ nameTh: p.nameTh, nameEn: p.nameEn || "", price: p.price, costPrice: p.costPrice || 0, stock: p.stock, status: p.status, categoryId: p.categoryId });
  };

  const handleSave = async () => {
    if (!editingId) return;
    setSaving(true);
    setMsg("");
    try {
      const data = await apiClient(`/api/products/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(editForm),
      });
      if (data.success) {
        setMsg("✅ บันทึกแล้ว");
        setEditingId(null);
        loadProducts();
      } else {
        setMsg("❌ " + (data.error || "เกิดข้อผิดพลาด"));
      }
    } catch (e: any) {
      setMsg("❌ " + e.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("ยืนยันลบสินค้านี้?")) return;
    try {
      await apiClient(`/api/products/${id}`, { method: "DELETE" });
      loadProducts();
    } catch {}
  }

  const addProduct = async () => {
    if (!addForm.nameTh) { alert("กรุณากรอกชื่อสินค้า"); return; }
    setSaving(true);
    try {
      const data = await apiClient("/api/products", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...addForm, categoryId: 1, status: "active" }),
      });
      if (data.success) { setShowAdd(false); setAddForm({ nameTh: "", nameEn: "", price: 0, stock: 0, sku: "" }); setMsg("✅ เพิ่มสินค้าแล้ว"); loadProducts(); }
      else { setMsg("❌ " + (data.error || "Error")); }
    } catch { setMsg("❌ เกิดข้อผิดพลาด"); }
    setSaving(false);
  };

  const handleAddCategory = async () => {
    if (!catForm.nameTh) { alert("กรุณากรอกชื่อหมวดหมู่"); return; }
    try {
      const data = await apiClient("/api/categories", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(catForm),
      });
      if (data.success) {
        setShowCatModal(false);
        setCatForm({ nameTh: "", nameEn: "", slug: "", icon: "📦", color: "blue" });
        setMsg("✅ เพิ่มหมวดหมู่สำเร็จ");
        loadProducts();
      }
    } catch {}
  };

  const catColors = ["blue","green","amber","pink","teal","purple","orange","slate","yellow","gray","red","indigo","cyan","rose"];
  const catIcons = ["📦","💊","🌿","✨","🧴","🩺","👶","🧹","☕","🐾","💄","🧪","🛡️","🎯"];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-8">
          <button onClick={() => setShowCatModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 font-medium flex items-center gap-1">
            ➕ เพิ่มหมวดหมู่
          </button>
          <h1 className="text-xl font-bold text-gray-900">จัดการสินค้า</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAdd(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-medium flex items-center gap-1">
            ➕ เพิ่มสินค้า
          </button>
          <a onClick={(e) => { e.preventDefault(); window.open("/api/export/products.csv", "_blank"); }}
            className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700 cursor-pointer">
            📥 Export CSV
          </a>
          <span className="text-sm text-gray-400">{products.length} รายการ</span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-3 mb-6">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadProducts()}
          placeholder="ค้นหาสินค้า..." className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
          <option value="">ทั้งหมด</option>
          {categories.map((c: any) => <option key={c.id} value={c.id}>{c.icon} {c.nameTh} ({c.productCount})</option>)}
        </select>
        <button onClick={loadProducts} className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">
          ค้นหา
        </button>
      </div>

      {msg && <div className="mb-4 p-3 rounded-lg text-sm bg-blue-50 border border-blue-200 text-blue-700">{msg}</div>}

      {/* Products table */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">กำลังโหลด...</div>
      ) : products.length === 0 ? (
        <div className="text-center py-16 text-gray-400">ไม่พบสินค้า</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="pb-3 font-medium hidden lg:table-cell">SKU</th>
                <th className="pb-3 font-medium">ชื่อสินค้า</th>
                <th className="pb-3 font-medium hidden md:table-cell">หมวดหมู่</th>
                <th className="pb-3 font-medium">ราคาขาย</th>
                <th className="pb-3 font-medium hidden lg:table-cell">ต้นทุน</th>
                <th className="pb-3 font-medium hidden lg:table-cell">กำไร%</th>
                <th className="pb-3 font-medium hidden lg:table-cell">กำไร฿</th>
                <th className="pb-3 font-medium">สต็อก</th>
                <th className="pb-3 font-medium hidden md:table-cell">สถานะ</th>
                <th className="pb-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p: any) => (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                  {editingId === p.id ? (
                    <>
                      <td className="py-3 text-gray-400">{p.sku}</td>
                      <td className="py-3">
                        <input value={editForm.nameTh} onChange={(e) => setEditForm({...editForm, nameTh: e.target.value})}
                          className="w-full px-2 py-1 border rounded text-sm" />
                      </td>
                      <td className="py-3">
                        <select value={editForm.categoryId} onChange={(e) => setEditForm({...editForm, categoryId: parseInt(e.target.value)})}
                          className="px-2 py-1 border rounded text-sm">
                          {categories.map((c: any) => <option key={c.id} value={c.id}>{c.icon} {c.nameTh}</option>)}
                        </select>
                      </td>
                      <td className="py-3">
                        <input type="number" value={editForm.price} onChange={(e) => setEditForm({...editForm, price: parseFloat(e.target.value) || 0})}
                          className="w-24 px-2 py-1 border rounded text-sm" />
                      </td>
                      <td className="py-3">
                        <input type="number" value={editForm.costPrice} onChange={(e) => setEditForm({...editForm, costPrice: parseFloat(e.target.value) || 0})}
                          className="w-24 px-2 py-1 border rounded text-sm text-orange-600" />
                      </td>
                      <td className="py-3 text-gray-500 text-xs">
                        {editForm.costPrice > 0 ? `${Math.round((editForm.price - editForm.costPrice) / editForm.costPrice * 100)}%` : "-"}
                      </td>
                      <td className="py-3 text-gray-500 text-xs">
                        {editForm.costPrice > 0 ? `฿${(editForm.price - editForm.costPrice).toFixed(2)}` : "-"}
                      </td>
                      <td className="py-3">
                        <input type="number" value={editForm.stock} onChange={(e) => setEditForm({...editForm, stock: parseInt(e.target.value) || 0})}
                          className="w-20 px-2 py-1 border rounded text-sm" />
                      </td>
                      <td className="py-3">
                        <select value={editForm.status} onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                          className="px-2 py-1 border rounded text-sm">
                          <option value="active">ขาย</option>
                          <option value="inactive">หยุด</option>
                        </select>
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <button onClick={handleSave} disabled={saving} className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">บันทึก</button>
                          <button onClick={() => setEditingId(null)} className="px-3 py-1 bg-gray-100 rounded text-xs hover:bg-gray-200">ยกเลิก</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-3 text-gray-400 font-mono text-xs hidden lg:table-cell">{p.sku}</td>
                      <td className="py-3 font-medium">{p.nameTh}</td>
                      <td className="py-3 hidden md:table-cell">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {p.categoryNameTh || (categories.find((c: any) => c.id === p.categoryId)?.nameTh) || "อื่นๆ"}
                        </span>
                      </td>
                      <td className="py-3 text-blue-600 font-medium">฿{p.price}</td>
                      <td className="py-3 text-orange-600 font-medium hidden lg:table-cell">
                        {p.costPrice > 0 ? `฿${p.costPrice}` : "-"}
                      </td>
                      <td className="py-3 font-medium hidden lg:table-cell">
                        {p.costPrice > 0 ? (
                          <span className={`${(p.price - p.costPrice) / p.costPrice > 0.2 ? "text-green-600" : "text-red-600"}`}>
                            {Math.round((p.price - p.costPrice) / p.costPrice * 100)}%
                          </span>
                        ) : "-"}
                      </td>
                      <td className="py-3 font-medium hidden lg:table-cell">
                        {p.costPrice > 0 ? (
                          <span className={`${(p.price - p.costPrice) > 0 ? "text-green-600" : "text-red-600"}`}>
                            ฿{(p.price - p.costPrice).toFixed(2)}
                          </span>
                        ) : "-"}
                      </td>
                      <td className="py-3">{p.stock}</td>
                      <td className="py-3 hidden md:table-cell">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${p.status === "active" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                          {p.status === "active" ? "ขาย" : "หยุด"}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <button onClick={() => handleEdit(p)} className="px-3 py-1 bg-blue-50 text-blue-600 rounded text-xs hover:bg-blue-100">แก้ไข</button>
                          <button onClick={() => handleDelete(p.id)} className="px-3 py-1 bg-red-50 text-red-600 rounded text-xs hover:bg-red-100">ลบ</button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      {/* Add Category Modal */}
      {showCatModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowCatModal(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">เพิ่มหมวดหมู่ใหม่</h2>
            <div className="space-y-3">
              <input placeholder="ชื่อไทย (เช่น ยา)" value={catForm.nameTh}
                onChange={(e) => setCatForm({...catForm, nameTh: e.target.value, slug: e.target.value.replace(/\s/g, '')})}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
              <input placeholder="ชื่ออังกฤษ (เช่น Medicine)" value={catForm.nameEn}
                onChange={(e) => setCatForm({...catForm, nameEn: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
              <div className="flex gap-3">
                <select value={catForm.icon} onChange={(e) => setCatForm({...catForm, icon: e.target.value})}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm">
                  {catIcons.map(ic => <option key={ic} value={ic}>{ic}</option>)}
                </select>
                <select value={catForm.color} onChange={(e) => setCatForm({...catForm, color: e.target.value})}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm">
                  {catColors.map(cl => <option key={cl} value={cl}>{cl}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleAddCategory} className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700">✅ เพิ่ม</button>
              <button onClick={() => setShowCatModal(false)} className="flex-1 py-2.5 bg-gray-100 rounded-xl font-medium hover:bg-gray-200">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">เพิ่มสินค้าใหม่</h2>
            <div className="space-y-3">
              <input placeholder="SKU (ถ้ามี)" value={addForm.sku} onChange={(e) => setAddForm({...addForm, sku: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
              <input placeholder="ชื่อสินค้า (ไทย) *" value={addForm.nameTh} onChange={(e) => setAddForm({...addForm, nameTh: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
              <input placeholder="ชื่อสินค้า (อังกฤษ)" value={addForm.nameEn} onChange={(e) => setAddForm({...addForm, nameEn: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">ราคาขาย</label>
                  <input type="number" value={addForm.price} onChange={(e) => setAddForm({...addForm, price: +e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="text-xs text-gray-500">ต้นทุน</label>
                  <input type="number" value={addForm.costPrice} onChange={(e) => setAddForm({...addForm, costPrice: +e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm text-orange-600" /></div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={addProduct} disabled={saving} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50">✅ {saving ? "กำลังเพิ่ม..." : "เพิ่มสินค้า"}</button>
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 bg-gray-100 rounded-xl font-medium hover:bg-gray-200">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
