import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [updating, setUpdating] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // Tracking modal state
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [trackingOrderId, setTrackingOrderId] = useState<number | null>(null);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingCarrier, setTrackingCarrier] = useState("Flash");

  const getAuthHeaders = () => {
    const token = localStorage.getItem("pharma_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadOrders = () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50", page: String(page) });
    if (statusFilter) params.set("status", statusFilter);
    apiClient(`/api/seller/orders?${params}`)
      .then(d => { setOrders(d.orders || []); setTotalPages(d.totalPages || 1); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadOrders(); }, [statusFilter, page]);

  const updateStatus = async (id: number, status: string) => {
    setUpdating(id);
    try {
      const data = await apiClient(`/api/seller/orders/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      if (!data.success) console.error("Update status failed:", data);
    } catch (e) {
      console.error("Update status error:", e);
    }
    setUpdating(null);
    loadOrders();
  };

  const handleConfirmPayment = async (orderId: number) => {
    setUpdating(orderId);
    try {
      // Single endpoint: backend handles status + payment + transaction in one transaction
      const data = await apiClient(`/api/seller/orders/${orderId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: "confirmed", confirmPayment: true }),
      });
      if (!data.success) throw new Error(data.error || "Failed");
      loadOrders();
    } catch (e) {
      alert("เกิดข้อผิดพลาด");
    }
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
          <a
            href="/api/export/orders.csv"
            onClick={(e) => {
              e.preventDefault();
              const t = localStorage.getItem("pharma_token");
              fetch("/api/export/orders.csv", { headers: t ? { Authorization: `Bearer ${t}` } : {} })
                .then(r => r.blob())
                .then(blob => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "orders.csv"; a.click(); URL.revokeObjectURL(a.href); })
                .catch(() => {});
            }}
            className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700"
          >
            📥 Export CSV
          </a>
          <span className="text-sm text-gray-400">{orders.length} ออเดอร์</span>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {["", "pending", "paid", "confirmed", "packing", "packed", "shipping", "cancelled"].map((s) => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm ${statusFilter === s ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {s ? STATUS_MAP[s] : "ทั้งหมด"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">กำลังโหลด...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-gray-400">ยังไม่มีออเดอร์</div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="bg-white rounded-xl border border-gray-200 p-4">
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
                {/* confirmed → packing (start packing) */}
                {o.status === "confirmed" && (
                  <button onClick={async () => {
                    setUpdating(o.id);
                    try {
                      const data = await apiClient(`/api/packing/start/${o.id}`, { method: "POST" });
                      if (data.slip) {
                        navigate(`/seller/packing/${data.slip.id}`);
                      } else {
                        loadOrders();
                      }
                    } catch {
                      loadOrders();
                    }
                    setUpdating(null);
                  }} disabled={updating === o.id}
                    className="px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700">📦 เริ่มแพ็ค</button>
                )}
                {/* packing → go to PackingDetailPage */}
                {o.status === "packing" && (
                  <button onClick={async () => {
                    setUpdating(o.id);
                    try {
                      const data = await apiClient(`/api/packing/slip-by-order/${o.id}`);
                      if (data.slip) {
                        navigate(`/seller/packing/${data.slip.id}`);
                      } else {
                        loadOrders();
                      }
                    } catch {
                      loadOrders();
                    }
                    setUpdating(null);
                  }} disabled={updating === o.id}
                    className="px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700">📦 ดูใบแพ็ค</button>
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
            </div>
          ))}
        </div>
      )}

      {/* Tracking Modal */}
      {showTrackingModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowTrackingModal(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
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
