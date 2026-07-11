import { useEffect, useState, useCallback } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useEventStream } from "../hooks/useEventStream";
import { getSessionId } from "../lib/session";
import { apiClient } from "../lib/api";

export default function AccountDashboard() {
  const { user, stats } = useOutletContext<any>();
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const token = localStorage.getItem("pharma_token");

  const fetchOrders = useCallback(() => {
    apiClient(`/api/account/orders?limit=5&sessionId=${getSessionId()}`)
      .then(d => {
      if (d.orders) setRecentOrders(d.orders);
    }).catch(() => {});
  }, [token]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // SSE for order-update events
  useEventStream({
    'order-update': useCallback(() => {
      fetchOrders();
    }, [fetchOrders]),
  }, {
    onConnected: () => setConnected(true),
    onDisconnected: () => setConnected(false),
  });

  const statCards = [
    { label: "รหัสลูกค้า", value: stats.customerCode || null, icon: "🆔", color: "purple" },
    { label: "ออเดอร์ทั้งหมด", value: stats.orders || 0, icon: "📋", color: "blue" },
    { label: "รายการโปรด", value: stats.wishlist || 0, icon: "❤️", color: "red" },
    { label: "แต้มสะสม", value: stats.points || 0, icon: "💰", color: "amber" },
  ];

  const statusColor: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    paid: "bg-green-100 text-green-800",
    confirmed: "bg-blue-100 text-blue-800",
    packing: "bg-indigo-100 text-indigo-800",
    packed: "bg-teal-100 text-teal-800",
    shipping: "bg-blue-100 text-blue-800",
    cancelled: "bg-red-100 text-red-800",
  };
  const statusLabel: Record<string, string> = {
    pending: "⏳ รอจ่ายเงิน", paid: "✅ จ่ายแล้ว", confirmed: "🕐 รออนุมัติ",
    packing: "📦 กำลังแพ็ค", packed: "📦 รอพนักงานเข้ารับ", shipping: "🚚 กำลังจัดส่ง",
    cancelled: "❌ ยกเลิก",
  };

  return (
    <div className="space-y-8">
      {/* Connection indicator */}
      <div className="flex items-center justify-end gap-2">
        <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-400"}`} />
        <span className="text-xs text-gray-400">{connected ? "เชื่อมต่อแล้ว" : "กำลังเชื่อมต่อ..."}</span>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="text-2xl mb-2">{card.icon}</div>
            <div className="text-2xl font-bold text-gray-900">{card.value ?? "—"}</div>
            <div className="text-sm text-gray-500 mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">ออเดอร์ล่าสุด</h3>
          <Link to="/account/orders" className="text-sm text-blue-600 hover:text-blue-700">ดูทั้งหมด →</Link>
        </div>
        {recentOrders.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">ยังไม่มีออเดอร์</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentOrders.map((order: any) => (
              <div key={order.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{order.orderNumber}</p>
                  <p className="text-xs text-gray-500">฿{Number(order.grandTotal).toFixed(2)} • {new Date(order.orderedAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                  {order.trackingNumber && (
                    <p className="text-xs mt-1">
                      📦{" "}
                      <a
                        href={`https://www.flashexpress.co.th/tracking/${order.trackingNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline hover:text-blue-800"
                      >
                        {order.trackingNumber}
                      </a>
                    </p>
                  )}
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColor[order.status] || "bg-gray-100 text-gray-600"}`}>
                  {statusLabel[order.status] || order.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
