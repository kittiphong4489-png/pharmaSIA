import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../lib/api";

interface Notification {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  isRead: number;
  createdAt: string;
  entityType: string;
  entityId: number | null;
}

const NOTIF_TYPES = [
  { value: "", label: "ทั้งหมด" },
  { value: "order_new", label: "ออเดอร์ใหม่" },
  { value: "order_pending", label: "รอจ่ายเงิน" },
  { value: "payment_confirm", label: "ชำระเงิน" },
  { value: "low_stock", label: "สินค้าใกล้หมด" },
  { value: "batch_expiring", label: "Batch หมดอายุ" },
  { value: "shipped", label: "จัดส่ง" },
  { value: "delivered", label: "ได้รับแล้ว" },
  { value: "cancelled", label: "ยกเลิก" },
];

export default function AdminNotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);

  const getToken = () => localStorage.getItem("pharma_token");

  const fetchNotifications = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (filterType) params.set("type", filterType);
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);

      const data = await apiClient(`/api/admin/notifications?${params}`);
      setNotifications(data.notifications || []);
      setTotalPages(data.totalPages || 1);
    } catch {}
    setLoading(false);
  }, [page, filterType, fromDate, toDate]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (id: number) => {
    const token = getToken();
    await apiClient(`/api/notifications/${id}/read`, {
      method: "POST",
    });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: 1 } : n))
    );
  };

  const markAllRead = async () => {
    const token = getToken();
    await apiClient("/api/notifications/read-all", {
      method: "POST",
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: 1 })));
  };

  const dismissNotif = async (id: number) => {
    const token = getToken();
    await apiClient(`/api/notifications/${id}`, {
      method: "DELETE",
    });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (selectedNotif?.id === id) setSelectedNotif(null);
  };

  const clearAll = async () => {
    if (!confirm("ล้างการแจ้งเตือนทั้งหมด?")) return;
    const token = getToken();
    await apiClient("/api/notifications/clear-all", {
      method: "POST",
    });
    setNotifications([]);
    setSelectedNotif(null);
  };

  const handleNav = (n: Notification) => {
    const entityType = n.entityType || "";
    const entityId = n.entityId;
    if (entityType === "order") navigate("/seller/orders");
    else if (entityType === "product" && entityId) navigate(`/products/${entityId}`);
    else if (entityType === "batch") navigate("/seller/batches");
    else if (n.type === "order_new" || n.type === "order_pending") navigate("/seller/orders");
    else if (n.type === "low_stock") navigate("/seller/products");
    else if (n.type === "batch_expiring") navigate("/seller/batches");
  };

  const iconMap: Record<string, string> = {
    order_new: "🆕", order_pending: "⏳", payment_confirm: "✅", payment_confirmed: "✅",
    shipped: "🚚", delivered: "📦", packing: "📦", packed: "📦",
    low_stock: "⚠️", batch_expiring: "🟡", cancelled: "❌", info: "ℹ️",
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">ศูนย์การแจ้งเตือน</h1>
          <p className="text-sm text-gray-500">จัดการการแจ้งเตือนทั้งหมด</p>
        </div>
        <div className="flex items-center gap-2">
          {notifications.some((n) => !n.isRead) && (
            <button
              onClick={markAllRead}
              className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
            >
              อ่านทั้งหมด
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={clearAll}
              className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
            >
              ล้างทั้งหมด
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
          >
            {NOTIF_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2"
            placeholder="จากวันที่"
          />
          <span className="text-xs text-gray-400">ถึง</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2"
            placeholder="ถึงวันที่"
          />
          <button
            onClick={() => { setFilterType(""); setFromDate(""); setToDate(""); setPage(1); }}
            className="text-xs px-3 py-2 text-gray-500 hover:text-gray-700"
          >
            ล้าง
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Notifications List */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="animate-pulse h-20 bg-gray-100 rounded-xl" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-4xl mb-3">🔔</p>
              <p className="text-sm text-gray-400">ไม่พบการแจ้งเตือน</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((n) => {
                const icon = iconMap[n.type] || "ℹ️";
                return (
                  <div
                    key={n.id}
                    onClick={() => setSelectedNotif(n)}
                    className={`bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:shadow-sm transition-all ${
                      !n.isRead ? "border-l-4 border-l-blue-500" : ""
                    } ${selectedNotif?.id === n.id ? "ring-2 ring-blue-200" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xl mt-0.5">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm ${!n.isRead ? "font-semibold" : ""} text-gray-900`}>
                            {n.title}
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            {!n.isRead && (
                              <button
                                onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                                className="text-[10px] text-blue-500 hover:underline"
                              >
                                อ่าน
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); dismissNotif(n.id); }}
                              className="text-[10px] text-red-400 hover:text-red-600"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {new Date(n.createdAt).toLocaleDateString("th-TH", {
                            day: "numeric", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                ← ก่อนหน้า
              </button>
              <span className="text-sm text-gray-500">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                ถัดไป →
              </button>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-1">
          {selectedNotif ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-24">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">รายละเอียด</h3>
                <button
                  onClick={() => setSelectedNotif(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-400 mb-1">ประเภท</p>
                  <span className="text-xl">{iconMap[selectedNotif.type] || "ℹ️"} {selectedNotif.type}</span>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">หัวข้อ</p>
                  <p className="text-sm font-medium text-gray-900">{selectedNotif.title}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">ข้อความ</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedNotif.message}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">วันที่</p>
                  <p className="text-sm text-gray-600">
                    {new Date(selectedNotif.createdAt).toLocaleDateString("th-TH", {
                      day: "numeric", month: "long", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>
                {selectedNotif.entityType && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">ลิงก์</p>
                    <button
                      onClick={() => handleNav(selectedNotif)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      ไปที่ {selectedNotif.entityType} #{selectedNotif.entityId || ""}
                    </button>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  {!selectedNotif.isRead && (
                    <button
                      onClick={() => markAsRead(selectedNotif.id)}
                      className="text-xs px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
                    >
                      อ่านแล้ว
                    </button>
                  )}
                  <button
                    onClick={() => dismissNotif(selectedNotif.id)}
                    className="text-xs px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
                  >
                    ลบ
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
              <p className="text-3xl mb-2">👆</p>
              <p>คลิกที่การแจ้งเตือนเพื่อดูรายละเอียด</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
