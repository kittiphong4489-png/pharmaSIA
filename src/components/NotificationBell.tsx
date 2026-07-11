import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { apiClient } from "../lib/api";

interface Notification {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  isRead: number;
  createdAt: string;
  entityType?: string;
  entityId?: number;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    const token = localStorage.getItem("pharma_token");
    if (!token) return;
    try {
      const [notifData, countRes] = await Promise.all([
        apiClient("/api/notifications"),
        apiClient("/api/notifications/unread-count"),
      ]);
      setNotifications(notifData.notifications || []);
      setUnreadCount(countRes.count !== undefined ? countRes.count : countRes.unread || 0);
    } catch {
      // ignore
    }
  }, []);

  // Listen for SSE-pushed notifications
  useEffect(() => {
    const handler = (_e: Event) => {
      fetchNotifications();
    };
    window.addEventListener("pharma-notification", handler);
    return () => window.removeEventListener("pharma-notification", handler);
  }, [fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (id: number) => {
    const token = localStorage.getItem("pharma_token");
    try {
      const data = await apiClient(`/api/notifications/${id}/read`, {
        method: "POST",
      });
      if (data) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: 1 } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch {
      // silently fail - don't optimistically update
    }
  };

  const handleNotifClick = (n: Notification) => {
    if (!n.isRead) markAsRead(n.id);
    setNotifOpen(false);

    // Navigate based on entity type
    const entityType = n.entityType || "";
    const entityId = n.entityId;

    if (entityType === "order") {
      navigate("/seller/orders");
    } else if (entityType === "product" && entityId) {
      navigate(`/products/${entityId}`);
    } else if (entityType === "batch") {
      navigate("/seller/batches");
    } else if (n.type === "order_new" || n.type === "order_pending") {
      navigate("/seller/orders");
    } else if (n.type === "low_stock") {
      navigate("/seller/products");
    } else if (n.type === "batch_expiring") {
      navigate("/seller/batches");
    } else {
      // Default fallback
      navigate("/seller/notifications");
    }
  };

  const iconMap: Record<string, string> = {
    order_pending: "🆕",
    order_new: "🆕",
    payment_confirm: "✅",
    payment_confirmed: "✅",
    shipped: "🚚",
    delivered: "📦",
    packing: "📦",
    packed: "📦",
    info: "ℹ️",
    low_stock: "⚠️",
    batch_expiring: "🟡",
  };

  if (!user) return null;

  return (
    <div ref={notifRef} className="relative">
      <button
        onClick={() => setNotifOpen(!notifOpen)}
        className="relative p-2.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-all"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {notifOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl border border-gray-100 shadow-lg overflow-hidden z-50">
          <div className="p-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-sm text-gray-900">การแจ้งเตือน</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setNotifOpen(false); navigate("/seller/notifications"); }}
                className="text-xs text-blue-600 hover:underline"
              >
                ดูทั้งหมด
              </button>
              <button
                onClick={fetchNotifications}
                className="text-xs text-blue-600 hover:underline"
              >
                รีเฟรช
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">
                ไม่มีการแจ้งเตือน
              </div>
            ) : (
              notifications.slice(0, 20).map((n) => {
                const icon = iconMap[n.type] || "ℹ️";
                return (
                  <div
                    key={n.id}
                    onClick={() => handleNotifClick(n)}
                    className={`p-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${
                      !n.isRead ? "bg-blue-50/50" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-base mt-0.5">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm ${
                            !n.isRead ? "font-semibold" : ""
                          } text-gray-900`}
                        >
                          {n.title}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {n.message}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {new Date(n.createdAt).toLocaleDateString("th-TH", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      {!n.isRead && (
                        <span className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
