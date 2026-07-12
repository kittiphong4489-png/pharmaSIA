import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSessionId } from "../lib/session";
import { Package, Clock, CheckCircle, XCircle, Truck, CreditCard, ChevronRight, FileText } from "lucide-react";
import { apiClient } from "../lib/api";

const STATUS_MAP: Record<string, { label: string; icon: any; color: string }> = {
  pending: { label: "รอจ่ายเงิน", icon: Clock, color: "text-amber-500" },
  paid: { label: "จ่ายแล้ว", icon: CreditCard, color: "text-green-500" },
  confirmed: { label: "รออนุมัติ", icon: Clock, color: "text-blue-500" },
  packing: { label: "กำลังแพ็ค", icon: Package, color: "text-blue-500" },
  packed: { label: "รอพนักงานเข้ารับ", icon: Package, color: "text-indigo-500" },
  shipping: { label: "กำลังจัดส่ง", icon: Truck, color: "text-blue-500" },
  cancelled: { label: "ยกเลิก", icon: XCircle, color: "text-red-500" },
};

export default function AccountOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerCode, setCustomerCode] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [cancelling, setCancelling] = useState<number | null>(null);

  const loadOrders = () => {
    const token = localStorage.getItem("pharma_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    apiClient(`/api/orders?limit=10&page=${page}&sessionId=${getSessionId()}`, { headers })
      .then(d => { setOrders(d.orders || []); setTotalPages(d.totalPages || 1); setLoading(false); })
      .catch(() => setLoading(false));
    apiClient("/api/account/stats", { headers })
      .then(d => { if (d.customerCode) setCustomerCode(d.customerCode); })
      .catch(() => {});
  };

  useEffect(() => { loadOrders(); }, [page]);

  const cancelOrder = async (orderId: number) => {
    if (!confirm("ยืนยันยกเลิกคำสั่งซื้อนี้?")) return;
    setCancelling(orderId);
    const token = localStorage.getItem("pharma_token");
    try {
      const data = await apiClient(`/api/orders/${orderId}/cancel`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (data.success) {
        loadOrders();
      } else {
        alert("❌ ไม่สามารถยกเลิกคำสั่งซื้อได้: " + (data.error || "เกิดข้อผิดพลาด"));
      }
    } catch {
      alert("❌ เกิดข้อผิดพลาด กรุณาลองใหม่");
    }
    setCancelling(null);
  };

  if (loading) return (
    <div className="px-0 py-8">
      <div className="animate-pulse space-y-4">
        {Array.from({length: 3}).map((_, i) => (
          <div key={i} className="h-24 sm:h-20 bg-gray-100 rounded-xl" />
        ))}
      </div>
    </div>
  );

  return (
    <div className="px-0 py-2 sm:py-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">คำสั่งซื้อของฉัน</h1>
        {customerCode && (
          <span className="self-start sm:self-auto text-xs sm:text-sm text-purple-600 bg-purple-50 px-3 py-1 rounded-full font-medium">
            🆔 {customerCode}
          </span>
        )}
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-gray-900 mb-2">ยังไม่มีคำสั่งซื้อ</h2>
          <p className="text-sm text-gray-500 mb-6">เมื่อคุณสั่งซื้อสินค้า คำสั่งซื้อจะปรากฏที่นี่</p>
          <Link to="/products" className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-medium text-sm hover:bg-blue-700 transition-all">
            ไปเลือกสินค้า <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <>
          {/* Order Cards - Responsive */}
          <div className="space-y-4">
            {orders.map(order => {
              const st = STATUS_MAP[order.status] || STATUS_MAP.pending;
              const Icon = st.icon;
              return (
                <div key={order.id} className="bg-white border border-gray-100 rounded-xl p-4 sm:p-5 hover:shadow-sm transition-all">
                  {/* Mobile: stacked layout */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    {/* Left: Order Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs sm:text-sm text-gray-400 truncate">{order.orderNumber}</span>
                        {order.status === "cancelled" && (
                          <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">ยกเลิก</span>
                        )}
                      </div>
                      <div className="text-base sm:text-lg font-semibold text-gray-900">฿{order.grandTotal?.toFixed(2)}</div>
                    </div>

                    {/* Right: Status + Actions */}
                    <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${st.color}`} />
                        <span className={`text-xs sm:text-sm font-medium ${st.color}`}>{st.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {order.status === "pending" && (
                          <>
                            <Link to={`/account/orders/${order.id}`}
                              className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-all font-medium">
                              💳 จ่ายต่อ
                            </Link>
                            <button
                              onClick={() => cancelOrder(order.id)}
                              disabled={cancelling === order.id}
                              className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-all disabled:opacity-50"
                            >
                              {cancelling === order.id ? "กำลังยกเลิก..." : "ยกเลิก"}
                            </button>
                          </>
                        )}
                        {order.status !== "pending" && (
                          <Link to={`/account/orders/${order.id}`}
                            className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50 transition-all flex items-center gap-1">
                            รายละเอียด <ChevronRight className="w-3 h-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Product items summary - mobile */}
                  {order.items && order.items.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-50">
                      <div className="flex flex-wrap gap-2">
                        {order.items.slice(0, 3).map((item: any, i: number) => (
                          <span key={i} className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-md truncate max-w-[150px] sm:max-w-[200px]">
                            {item.productNameTh || item.productNameEn || `สินค้า #${item.productId}`}
                            <span className="text-gray-300 mx-1">×</span>
                            {item.quantity}
                          </span>
                        ))}
                        {order.items.length > 3 && (
                          <span className="text-xs text-gray-400">+{order.items.length - 3} รายการ</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination - responsive */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                ← ก่อนหน้า
              </button>
              <div className="flex gap-1 overflow-x-auto max-w-[60vw]">
                {Array.from({length: Math.min(totalPages, 20)}).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i + 1)}
                    className={`w-9 h-9 text-sm rounded-lg font-medium transition-all flex-shrink-0 ${
                      page === i + 1
                        ? "bg-blue-600 text-white"
                        : "text-gray-600 hover:bg-gray-50 border border-gray-200"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                ถัดไป →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
