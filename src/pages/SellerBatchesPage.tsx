import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";

interface Batch {
  id: number;
  productId: number;
  batchNumber: string;
  expiryDate: string | null;
  quantity: number;
  initialQuantity: number;
  unitCost: number;
  supplier: string;
  receivedDate: string;
  status: string;
  notes: string;
  createdAt: string;
  productName: string;
  productSku: string;
}

interface Product {
  id: number;
  nameTh: string;
  sku: string;
}

export default function SellerBatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [filterProductId, setFilterProductId] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error">("success");
  const [form, setForm] = useState({
    productId: 0,
    batchNumber: "",
    expiryDate: "",
    quantity: 0,
    unitCost: 0,
    supplier: "",
    receivedDate: new Date().toISOString().split("T")[0],
    notes: "",
  });
  // Edit state
  const [editingBatchId, setEditingBatchId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    batchNumber: "",
    expiryDate: "",
    quantity: 0,
    unitCost: 0,
    supplier: "",
    receivedDate: "",
    notes: "",
    status: "",
  });

  const getAuthHeaders = () => {
    const token = localStorage.getItem("pharma_token");
    return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
  };

  const loadBatches = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterProductId) params.set("productId", filterProductId);
    apiClient(`/api/batches?${params}`)
      
      .then((data) => {
        setBatches(data.batches || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadBatches();
    apiClient("/api/products?limit=200")
      
      .then((data) => setProducts(data.items || []))
      .catch(() => {});
  }, [filterProductId]);

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => setMsg(""), 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    try {
      const data = await apiClient("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      if (data.success) {
        showMsg(`✅ เพิ่ม Batch/Lot #${form.batchNumber} สำเร็จ`);
        setShowForm(false);
        setForm({
          productId: 0, batchNumber: "", expiryDate: "",
          quantity: 0, unitCost: 0, supplier: "",
          receivedDate: new Date().toISOString().split("T")[0], notes: "",
        });
        loadBatches();
      } else {
        showMsg(`❌ ${data.error}`, "error");
      }
    } catch (e: any) {
      showMsg(`❌ ${e?.message || "Error"}`, "error");
    }
  };

  const startEdit = (batch: Batch) => {
    setEditingBatchId(batch.id);
    setEditForm({
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate || "",
      quantity: batch.quantity,
      unitCost: batch.unitCost,
      supplier: batch.supplier,
      receivedDate: batch.receivedDate,
      notes: batch.notes,
      status: batch.status,
    });
  };

  const saveEdit = async () => {
    if (!editingBatchId) return;
    try {
      const data = await apiClient(`/api/batches/${editingBatchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(editForm),
      });
      if (data.success) {
        showMsg(`✅ อัปเดต Batch #${editForm.batchNumber} สำเร็จ`);
        setEditingBatchId(null);
        loadBatches();
      } else {
        showMsg(`❌ ${data.error}`, "error");
      }
    } catch (e: any) {
      showMsg(`❌ ${e?.message || "Error"}`, "error");
    }
  };

  const deleteBatch = async (id: number, batchNumber: string) => {
    if (!confirm(`ลบ Batch #${batchNumber}?`)) return;
    try {
      const data = await apiClient(`/api/batches/${id}`, {
        method: "DELETE",
      });
      if (data.success) {
        showMsg(`✅ ลบ Batch #${batchNumber} สำเร็จ`);
        loadBatches();
      } else {
        showMsg(`❌ ${data.error}`, "error");
      }
    } catch (e: any) {
      showMsg(`❌ ${e?.message || "Error"}`, "error");
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-green-100 text-green-800",
      expired: "bg-red-100 text-red-800",
      depleted: "bg-gray-100 text-gray-800",
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] || "bg-blue-100 text-blue-800"}`}>
        {status === "active" ? "ใช้งาน" : status === "expired" ? "หมดอายุ" : status === "depleted" ? "หมดสต็อก" : status}
      </span>
    );
  };

  const getExpiryAlert = (expiryDate: string | null): { className: string; label: string } => {
    if (!expiryDate) return { className: "", label: "" };
    const now = new Date();
    const exp = new Date(expiryDate);
    const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { className: "bg-red-50 border-l-4 border-red-500", label: `หมดอายุแล้ว (${Math.abs(diffDays)} วันที่แล้ว)` };
    if (diffDays <= 90) return { className: "bg-amber-50 border-l-4 border-amber-400", label: `จะหมดอายุใน ${diffDays} วัน` };
    return { className: "", label: `${diffDays} วัน` };
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">📦 จัดการ Batch / Lot</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          {showForm ? "✕ ยกเลิก" : "+ เพิ่ม Batch"}
        </button>
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-lg ${msgType === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
          {msg}
        </div>
      )}

      {/* Add Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border p-6 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">สินค้า *</label>
            <select required value={form.productId} onChange={(e) => setForm({ ...form, productId: parseInt(e.target.value) })}
              className="w-full border rounded-lg px-3 py-2">
              <option value="">-- เลือกสินค้า --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.sku} - {p.nameTh}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เลขที่ Batch/Lot *</label>
            <input required value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
              className="w-full border rounded-lg px-3 py-2" placeholder="เช่น LOT-001" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">วันหมดอายุ</label>
            <input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
              className="w-full border rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">จำนวน</label>
            <input type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 0 })}
              className="w-full border rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ต้นทุนต่อหน่วย</label>
            <input type="number" min="0" step="0.01" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: parseFloat(e.target.value) || 0 })}
              className="w-full border rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ซัพพลายเออร์</label>
            <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })}
              className="w-full border rounded-lg px-3 py-2" placeholder="ชื่อบริษัท/ร้านค้า" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">วันที่รับเข้า</label>
            <input type="date" value={form.receivedDate} onChange={(e) => setForm({ ...form, receivedDate: e.target.value })}
              className="w-full border rounded-lg px-3 py-2" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full border rounded-lg px-3 py-2" placeholder="บันทึกเพิ่มเติม" />
          </div>
          <div className="flex items-end">
            <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 w-full">
              💾 บันทึก
            </button>
          </div>
        </form>
      )}

      {/* Filter */}
      <div className="mb-4 flex items-center gap-2">
        <label className="text-sm font-medium">กรองตามสินค้า:</label>
        <select value={filterProductId} onChange={(e) => setFilterProductId(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm">
          <option value="">ทั้งหมด</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.sku} - {p.nameTh}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">กำลังโหลด...</div>
      ) : batches.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <div className="text-4xl mb-2">📦</div>
          <p className="text-gray-500">ยังไม่มีข้อมูล Batch/Lot</p>
          <button onClick={() => setShowForm(true)} className="mt-3 text-blue-600 hover:underline">เพิ่ม Batch แรก</button>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl shadow-sm border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">รหัสสินค้า</th>
                <th className="px-4 py-3 text-left">สินค้า</th>
                <th className="px-4 py-3 text-left">Batch/Lot</th>
                <th className="px-4 py-3 text-left">วันหมดอายุ</th>
                <th className="px-4 py-3 text-right">จำนวน</th>
                <th className="px-4 py-3 text-right">ต้นทุน/หน่วย</th>
                <th className="px-4 py-3 text-left">ซัพพลายเออร์</th>
                <th className="px-4 py-3 text-center">สถานะ</th>
                <th className="px-4 py-3 text-right">วันที่รับ</th>
                <th className="px-4 py-3 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                editingBatchId === b.id ? (
                  <tr key={b.id} className="border-b bg-blue-50">
                    <td className="px-4 py-3 font-mono text-xs">{b.productSku}</td>
                    <td className="px-4 py-3">{b.productName}</td>
                    <td className="px-4 py-3"><input value={editForm.batchNumber} onChange={e => setEditForm({...editForm, batchNumber: e.target.value})} className="w-full px-2 py-1 border rounded text-xs" /></td>
                    <td className="px-4 py-3"><input type="date" value={editForm.expiryDate} onChange={e => setEditForm({...editForm, expiryDate: e.target.value})} className="w-full px-2 py-1 border rounded text-xs" /></td>
                    <td className="px-4 py-3"><input type="number" value={editForm.quantity} onChange={e => setEditForm({...editForm, quantity: parseInt(e.target.value) || 0})} className="w-20 px-2 py-1 border rounded text-xs text-right" /></td>
                    <td className="px-4 py-3"><input type="number" step="0.01" value={editForm.unitCost} onChange={e => setEditForm({...editForm, unitCost: parseFloat(e.target.value) || 0})} className="w-20 px-2 py-1 border rounded text-xs text-right" /></td>
                    <td className="px-4 py-3"><input value={editForm.supplier} onChange={e => setEditForm({...editForm, supplier: e.target.value})} className="w-full px-2 py-1 border rounded text-xs" /></td>
                    <td className="px-4 py-3 text-center">
                      <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})} className="px-2 py-1 border rounded text-xs">
                        <option value="active">ใช้งาน</option>
                        <option value="expired">หมดอายุ</option>
                        <option value="depleted">หมดสต็อก</option>
                      </select>
                    </td>
                    <td className="px-4 py-3"><input type="date" value={editForm.receivedDate} onChange={e => setEditForm({...editForm, receivedDate: e.target.value})} className="w-full px-2 py-1 border rounded text-xs" /></td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-1 justify-center">
                        <button onClick={saveEdit} className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">💾</button>
                        <button onClick={() => setEditingBatchId(null)} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200">✕</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={b.id} className={`border-b hover:bg-gray-50 transition-colors ${getExpiryAlert(b.expiryDate).className}`}>
                    <td className="px-4 py-3 font-mono text-xs">{b.productSku}</td>
                    <td className="px-4 py-3">{b.productName}</td>
                    <td className="px-4 py-3 font-mono font-medium">{b.batchNumber}</td>
                    <td className="px-4 py-3">
                      {b.expiryDate ? (
                        <span title={getExpiryAlert(b.expiryDate).label} className="cursor-help">
                          {b.expiryDate}
                          {getExpiryAlert(b.expiryDate).label && (
                            <span className={`ml-1.5 text-xs font-medium ${
                              getExpiryAlert(b.expiryDate).className.includes('red') ? 'text-red-600' :
                              getExpiryAlert(b.expiryDate).className.includes('amber') ? 'text-amber-600' : 'text-gray-400'
                            }`}>
                              ({getExpiryAlert(b.expiryDate).label.split('(')[0] || getExpiryAlert(b.expiryDate).label})
                            </span>
                          )}
                        </span>
                      ) : "-"}
                    </td>
                    <td className="px-4 py-3 text-right">{b.quantity}</td>
                    <td className="px-4 py-3 text-right">{b.unitCost?.toFixed(2)}</td>
                    <td className="px-4 py-3">{b.supplier || "-"}</td>
                    <td className="px-4 py-3 text-center">{getStatusBadge(b.status)}</td>
                    <td className="px-4 py-3 text-right text-xs">{b.receivedDate}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => startEdit(b)} className="px-2 py-1 text-blue-600 hover:bg-blue-50 rounded text-xs">✏️</button>
                        <button onClick={() => deleteBatch(b.id, b.batchNumber)} className="px-2 py-1 text-red-600 hover:bg-red-50 rounded text-xs">🗑️</button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
