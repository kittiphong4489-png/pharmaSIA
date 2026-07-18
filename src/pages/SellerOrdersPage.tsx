import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import Pagination from "../components/Pagination";

interface Order {
  id: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  subtotal: number;
  shippingFee: number;
  grandTotal: number;
  status: string;
  notes: string | null;
  orderedAt: string;
  itemCount: number;
}

const STATUS_MAP: Record<string, string> = {
  pending: "รอจ่ายเงิน",
  paid: "จ่ายแล้ว",
  confirmed: "รออนุมัติ",
  packing: "กำลังแพ็ค",
  packed: "รอพนักงานเข้ารับ",
  shipping: "กำลังจัดส่ง",
  cancelled: "ยกเลิก",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  paid: "bg-green-100 text-green-700",
  confirmed: "bg-blue-100 text-blue-700",
  packing: "bg-indigo-100 text-indigo-700",
  packed: "bg-teal-100 text-teal-700",
  shipping: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function SellerOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [updating, setUpdating] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // Tracking modal state
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [trackingOrderId, setTrackingOrderId] = useState<number | null>(null);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingCarrier, setTrackingCarrier] = useState("Flash");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulking, setBulking] = useState(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("pharma_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadOrders = () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50", page: String(page) });
    if (statusFilter) params.set("status", statusFilter);
    if (searchTerm) params.set("search", searchTerm);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    apiClient(`/api/seller/orders?${params}`)
      .then(d => { setOrders(d.orders || []); setTotalPages(d.totalPages || 1); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadOrders(); }, [statusFilter, page, searchTerm, dateFrom, dateTo]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulkConfirm = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`ยืนยัน ${selectedIds.size} ออเดอร์ที่เลือก?`)) return;
    setBulking(true);
    let ok = 0; let fail = 0;
    for (const id of selectedIds) {
      try {
        const data = await apiClient(`/api/seller/orders/${id}/status`, {
          method: "PUT", body: JSON.stringify({ status: "confirmed", confirmPayment: true }),
        });
        if (data.success) ok++; else fail++;
      } catch { fail++; }
    }
    setSelectedIds(new Set());
    setBulking(false);
    alert(`✅ ${ok} สำเร็จ${fail > 0 ? `, ❌ ${fail} ไม่สำเร็จ` : ""}`);
    loadOrders();
  };

  const updateStatus = async (id: number, status: string) => {
    setUpdating(id);
    try {
      const data = await apiClient(`/api/seller/orders/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      if (!data.success) console.error("Update status failed:", data);
      else loadOrders();
    } catch (e) {
      console.error("Update status error:", e);
    }
    setUpdating(null);
  };

  const handleConfirmPayment = async (orderId: number) => {
    setUpdating(orderId);
    try {
      const data = await apiClient(`/api/seller/orders/${orderId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: "confirmed", confirmPayment: true }),
      });
      if (!data.success) throw new Error(data.error || "Failed");
    } catch (e) {
      alert("เกิดข้อผิดพลาด");
    }
    setUpdating(null);
    loadOrders();
  };

  const handleTrackingSubmit = async () => {
    if (!trackingOrderId || !trackingNumber) return;
    setUpdating(trackingOrderId);
    await apiClient(`/api/seller/orders/${trackingOrderId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "shipping", trackingNumber, carrier: trackingCarrier }),
    });
    setUpdating(null);
    setShowTrackingModal(false);
    setTrackingOrderId(null);
    setTrackingNumber("");
    setTrackingCarrier("Flash");
    loadOrders();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">รายการออเดอร์</h1>
        <div className="flex items-center gap-2">
          <a href="/api/export/orders.csv" onClick={(e) => {e.preventDefault(); const t = localStorage.getItem("pharma_token"); fetch("/api/export/orders.csv", { headers: t ? { Authorization: `Bearer ${t}` } : {} }).then(r => r.blob()).then(blob => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "orders.csv"; a.click(); URL.revokeObjectURL(a.href); }).catch(() => {});}} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700">📥 Export CSV</a>
          <span className="text-sm text-gray-400">{orders.length} ออเดอร์</span>
        </div>
      </div>

      {/* Search + Date Filter */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <input
          type="text" value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
          placeholder="🔍 ค้นหาชื่อ/เบอร์..."
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-48 focus:outline-none focus:border-blue-400"
        />
        <input
          type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
        />
        <span className="text-gray-400 text-sm">—</span>
        <input
          type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
        />
        {(searchTerm || dateFrom || dateTo) && (
          <button onClick={() => { setSearchTerm(""); setDateFrom(""); setDateTo(""); setPage(1); }}
            className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg">✕ ล้าง</button>
        )}
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {["", "pending", "paid", "confirmed", "packing", "packed", "shipping", "cancelled"].map((s) => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm ${statusFilter === s ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {s ? STATUS_MAP[s] : "ทั้งหมด"}
          </button>
        ))}
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
          <span className="text-sm font-medium text-blue-700">{selectedIds.size} รายการที่เลือก</span>
          <button onClick={bulkConfirm} disabled={bulking}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {bulking ? "กำลังดำเนินการ..." : "✅ ยืนยันทั้งหมด"}
          </button>
          <button onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">✕ ยกเลิก</button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400">กำลังโหลด...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-gray-400">ยังไม่มีออเดอร์</div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start gap-3">
                {/* Checkbox */}
                {(o.status === "paid" || o.status === "pending") && (
                  <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)}
                    className="mt-1.5 w-4 h-4 text-blue-600 rounded focus:ring-blue-500" />
                )}
                <div className="flex-1">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="font-mono text-sm font-bold text-gray-900 truncate block max-w-[200px] sm:max-w-xs">{o.orderNumber}</span>
                  <span className="text-xs text-gray-400 ml-0 block sm:inline sm:ml-3 mt-0.5 sm:mt-0">{new Date(o.orderedAt).toLocaleString("th-TH")}</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || "bg-gray-100"}`}>
                  {STATUS_MAP[o.status] || o.status}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                <span>👤 {o.customerName}</span>
                {o.customerPhone && <span>📞 {o.customerPhone}</span>}
                <span>📦 {o.itemCount} รายการ</span>
                <span className="font-bold text-blue-600">฿{o.grandTotal.toFixed(2)}</span>
              </div>
              {o.notes && <p className="text-xs text-gray-400 mb-2">📝 {o.notes}</p>}
              {(o as any).trackingNumber && (
                <p className="text-xs mb-2">
                  📦 เลขพัสดุ:{" "}
                  <a
                    href={`https://www.flashexpress.co.th/tracking/${(o as any).trackingNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline hover:text-blue-800"
                  >
                    {(o as any).trackingNumber}
                  </a>{" "}
                  {(o as any).carrier ? `(${(o as any).carrier})` : ""}
                </p>
              )}
              <div className="flex gap-2 flex-wrap">
                {/* pending → paid (ลูกค้าจ่ายแล้ว) */}
                {o.status === "pending" && (
                  <button onClick={() => updateStatus(o.id, "paid")} disabled={updating === o.id}
                    className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700">✅ จ่ายแล้ว</button>
                )}
                {/* paid → confirmed (admin ยืนยันออเดอร์ + ตัดสต็อก) */}
                {o.status === "paid" && (
                  <button onClick={() => handleConfirmPayment(o.id)} disabled={updating === o.id}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">✅ ยืนยันออเดอร์</button>
                )}
                {/* confirmed → packing (direct status update) */}
                {o.status === "confirmed" && (
                  <button onClick={() => updateStatus(o.id, "packing")} disabled={updating === o.id}
                    className="px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700">📦 เริ่มแพ็ค</button>
                )}
                {/* packing → packed */}
                {o.status === "packing" && (
                  <button onClick={() => updateStatus(o.id, "packed")} disabled={updating === o.id}
                    className="px-3 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700">✅ แพ็คเสร็จ</button>
                )}
                {/* packed → shipping (tracking modal) */}
                {o.status === "packed" && (
                  <button onClick={() => { setTrackingOrderId(o.id); setShowTrackingModal(true); }}
                    disabled={updating === o.id}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">🚚 จัดส่ง</button>
                )}
                {/* cancel: pending only */}
                {o.status === "pending" && (
                  <button onClick={() => updateStatus(o.id, "cancelled")} disabled={updating === o.id}
                    className="px-3 py-1 bg-red-50 text-red-600 rounded text-xs hover:bg-red-100">ยกเลิก</button>
                )}
                <a href={`/api/orders/${o.id}/invoice`}
                  onClick={(e) => {
                    e.preventDefault();
                    const token = localStorage.getItem("pharma_token");
                    const h = token ? { Authorization: `Bearer ${token}` } : {};
                    fetch(`/api/orders/${o.id}/invoice`, { headers: h })
                      .then(r => r.blob())
                      .then(blob => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `invoice-${o.orderNumber||o.id}.pdf`; a.click(); URL.revokeObjectURL(a.href); })
                      .catch(() => {});
                  }}
                  className="px-3 py-1 bg-gray-100 rounded text-xs hover:bg-gray-200">📄 PDF</a>
              </div>
              </div> {/* close flex-1 */}
            </div> {/* close flex row */}
          </div>
          ))}
        </div>
      )}

      {/* Tracking Modal */}
      {showTrackingModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowTrackingModal(false)}>
          <div className="bg-white rounded-2xl p-6 sm:max-w max-w-full sm:rounded-2xl rounded-none sm:mx-4 mx-0-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">🚚 กำหนดเลขพัสดุ</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เลขพัสดุ</label>
                <input type="text" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="เช่น EMS123456TH" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">บริษัทขนส่ง</label>
                <select value={trackingCarrier} onChange={(e) => setTrackingCarrier(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="EMS">EMS</option>
                  <option value="Kerry">Kerry</option>
                  <option value="Flash">Flash</option>
                  <option value="J&T">J&T Express</option>
                  <option value="DHL">DHL</option>
                  <option value="ไปรษณีย์ไทย">ไปรษณีย์ไทย</option>
                  <option value="อื่นๆ">อื่นๆ</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowTrackingModal(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all">ยกเลิก</button>
                <button onClick={handleTrackingSubmit} disabled={!trackingNumber}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-all">ยืนยันจัดส่ง</button>
              </div>
            </div>
          </div>

          {/* Pagination */}
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
