import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../lib/api";
import type { Product, Category } from "../types";

export default function SellerProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ nameTh: "", nameEn: "", price: 0, stock: 0, status: "active" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const loadProducts = () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (catFilter) params.set("categoryId", catFilter);
    if (search) params.set("search", search);
    Promise.all([
      apiClient(`/api/products?${params}`),
      apiClient("/api/categories"),
    ]).then(([data, cats]) => {
      setProducts(data.items || []);
      setCategories(cats || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { loadProducts(); }, [catFilter]);

  const handleEdit = (p: Product) => {
    setEditingId(p.id);
    setEditForm({ nameTh: p.nameTh, nameEn: p.nameEn, price: p.price, stock: p.stock, status: p.status });
  };

  const handleSave = async () => {
    if (!editingId) return;
    setSaving(true);
    setMsg("");
    const token = localStorage.getItem("pharma_token");
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
      const token = localStorage.getItem("pharma_token");
      await apiClient(`/api/products/${id}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      loadProducts();
    } catch {}
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">จัดการสินค้า</h1>
        <div className="flex items-center gap-2">
          <a
            href="/api/export/products.csv"
            onClick={(e) => { e.preventDefault(); window.open("/api/export/products.csv", "_blank"); }}
            className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700"
          >
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
          {categories.map((c) => <option key={c.id} value={c.id}>{c.nameTh}</option>)}
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
                <th className="pb-3 font-medium">SKU</th>
                <th className="pb-3 font-medium">ชื่อสินค้า</th>
                <th className="pb-3 font-medium">ราคา</th>
                <th className="pb-3 font-medium">สต็อก</th>
                <th className="pb-3 font-medium">สถานะ</th>
                <th className="pb-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                  {editingId === p.id ? (
                    <>
                      <td className="py-3 text-gray-400">{p.sku}</td>
                      <td className="py-3">
                        <input value={editForm.nameTh} onChange={(e) => setEditForm({ ...editForm, nameTh: e.target.value })}
                          className="w-full px-2 py-1 border rounded text-sm" />
                      </td>
                      <td className="py-3">
                        <input type="number" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: parseFloat(e.target.value) || 0 })}
                          className="w-24 px-2 py-1 border rounded text-sm" />
                      </td>
                      <td className="py-3">
                        <input type="number" value={editForm.stock} onChange={(e) => setEditForm({ ...editForm, stock: parseInt(e.target.value) || 0 })}
                          className="w-20 px-2 py-1 border rounded text-sm" />
                      </td>
                      <td className="py-3">
                        <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
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
                      <td className="py-3 text-gray-400 font-mono text-xs">{p.sku}</td>
                      <td className="py-3 font-medium">{p.nameTh}</td>
                      <td className="py-3 text-blue-600 font-medium">฿{p.price}</td>
                      <td className="py-3">{p.stock}</td>
                      <td className="py-3">
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
    </div>
  );
}
