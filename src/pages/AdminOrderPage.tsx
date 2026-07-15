import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";

interface AdminOrder {
  id: number;
  orderNumber: string;
  customerName: string;
  grandTotal: number;
  status: string;
  orderedAt: string;
  trackingNumber?: string;
}

interface Payment {
  id: number;
  orderId: number;
  amount: number;
  status: string;
  slipUrl?: string;
  method: string;
}

const STATUS_MAP: Record<string, string> = {
  pending: "⏳ รอชำระ",
  paid: "💰 จ่ายแล้ว",
  confirmed: "✅ ยืนยันแล้ว",
  packing: "📦 กำลังแพ็ค",
  packed: "📋 รอรับ",
  shipping: "🚚 กำลังจัดส่ง",
  delivered: "✅ ส่งสำเร็จ",
  cancelled: "❌ ยกเลิก",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  paid: "bg-blue-100 text-blue-700",
  confirmed: "bg-green-100 text-green-700",
  packing: "bg-purple-100 text-purple-700",
  packed: "bg-indigo-100 text-indigo-700",
  shipping: "bg-cyan-100 text-cyan-700",
  delivered: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function AdminOrderPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [payments, setPayments] = useState<Record<number, Payment>>({});
  const [loading, setLoading] = useState(true);
  const [slipModal, setSlipModal] = useState<{ orderId: number; slipUrl: string } | null>(null);
  const [trackingInput, setTrackingInput] = useState<Record<number, string>>({});

  const loadOrders = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("pharma_token");
      const data = await apiClient("/api/orders", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setOrders(data.orders || []);
      // Fetch payments for each order
      const payMap: Record<number, Payment> = {};
      for (const order of data.orders || []) {
        try {
          const payData = await apiClient(`/api/payments/order/${order.id}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (payData.payment) payMap[order.id] = payData.payment;
        } catch {}
      }
      setPayments(payMap);
    } catch (e) {
      console.error("Load orders failed:", e);
    }
    setLoading(false);
  };

  const updateStatus = async (orderId: number, status: string, tracking?: string) => {
    try {
      const token = localStorage.getItem("pharma_token");
      await apiClient(`/api/seller/orders/${orderId}/status`, {
        method: "PUT",
        headers: token ? { Authorization: `Bearer ${token}` } : { "Content-Type": "application/json" },
        body: JSON.stringify({ status, trackingNumber: tracking || "" }),
      });
      loadOrders();
    } catch (e) {
      alert("❌ อัปเดตสถานะไม่สำเร็จ");
      console.error(e);
    }
  };

  useEffect(() => { loadOrders(); }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">📋 จัดการคำสั่งซื้อ</h1>
        <button onClick={loadOrders} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
          🔄 รีเฟรช
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="text-5xl mb-4">📋</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">ไม่มีคำสั่งซื้อ</h2>
          <p className="text-gray-500">รอลูกค้าสั่งซื้อสินค้า</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const pay = payments[order.id];
            const slipUrl = pay?.slipUrl || "";
            const isPaid = order.status === "paid" || order.status === "confirmed";
            const isShipped = order.status === "shipping" || order.status === "delivered";

            return (
              <div key={order.id} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-sm transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900">#{order.orderNumber}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-600"}`}>
                        {STATUS_MAP[order.status] || order.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {order.customerName} · {new Date(order.orderedAt).toLocaleDateString("th-TH")} · ฿{order.grandTotal?.toFixed(2)}
                    </p>
                    {order.trackingNumber && (
                      <p className="text-xs text-blue-600 mt-1">📬 Tracking: {order.trackingNumber}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* View Slip Button */}
                    {slipUrl && (
                      <button onClick={() => setSlipModal({ orderId: order.id, slipUrl })}
                        className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200">
                        📎 ดูสลิป
                      </button>
                    )}

                    {/* Confirm Payment Button */}
                    {order.status === "paid" && (
                      <button onClick={() => updateStatus(order.id, "confirmed")}
                        className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700">
                        ✅ ยืนยันการชำระ
                      </button>
                    )}

                    {/* Start Packing Button */}
                    {order.status === "confirmed" && (
                      <button onClick={() => updateStatus(order.id, "packing")}
                        className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                        📦 เริ่มแพ็ค
                      </button>
                    )}

                    {/* Finish Packing Button */}
                    {order.status === "packing" && (
                      <button onClick={() => updateStatus(order.id, "packed")}
                        className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                        📦✅ แพ็คเสร็จ
                      </button>
                    )}

                    {/* Shipping Input + Button */}
                    {order.status === "packed" && (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder="Tracking No."
                          value={trackingInput[order.id] || ""}
                          onChange={(e) => setTrackingInput(prev => ({ ...prev, [order.id]: e.target.value }))}
                          className="w-28 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button onClick={() => {
                          const tracking = trackingInput[order.id] || "";
                          if (!tracking) { alert("กรุณากรอกเลข Tracking"); return; }
                          updateStatus(order.id, "shipping", tracking);
                        }}
                          className="px-3 py-1.5 text-xs font-medium bg-cyan-600 text-white rounded-lg hover:bg-cyan-700">
                          🚚 จัดส่ง
                        </button>
                      </div>
                    )}

                    {/* Delivered Button */}
                    {order.status === "shipping" && (
                      <button onClick={() => updateStatus(order.id, "delivered")}
                        className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                        ✅ ส่งสำเร็จ
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Slip Modal */}
      {slipModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSlipModal(null)}>
          <div className="bg-white rounded-2xl p-6 sm:max-w max-w-full sm:rounded-2xl rounded-none sm:mx-4 mx-0-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">📎 สลิปโอนเงิน</h3>
              <button onClick={() => setSlipModal(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">✕</button>
            </div>
            <p className="text-sm text-gray-500 mb-3">ออเดอร์ #{slipModal.orderId}</p>
            {slipModal.slipUrl.endsWith(".pdf") ? (
              <iframe src={slipModal.slipUrl} className="w-full h-96 rounded-lg border border-gray-200" title="Slip PDF" />
            ) : (
              <img src={slipModal.slipUrl} alt="สลิปโอนเงิน" className="w-full rounded-lg border border-gray-200" onError={(e) => {
                (e.target as HTMLImageElement).src = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect fill='%23f0f0f0' width='200' height='200'/><text x='50%25' y='50%25' fill='%23999' text-anchor='middle' dy='.3em'>ไม่พบรูปสลิป</text></svg>";
              }} />
            )}
            <a href={slipModal.slipUrl} target="_blank" rel="noopener noreferrer"
              className="block w-full mt-4 py-2.5 text-center text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700">
              🔗 เปิดในแท็บใหม่
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
