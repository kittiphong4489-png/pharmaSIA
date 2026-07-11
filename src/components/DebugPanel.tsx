import { useEffect, useState, useCallback } from "react";
import { apiClient } from "../lib/api";
import { getSessionId } from "../lib/session";

interface DebugData {
  cartCount: number;
  lastOrderId: string;
  apiOnline: boolean;
  ts: string;
}

export default function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DebugData>({ cartCount: 0, lastOrderId: "-", apiOnline: false, ts: "" });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [cartData, healthData] = await Promise.allSettled([
        apiClient(`/api/cart?sessionId=${getSessionId()}`),
        apiClient("/api/health"),
      ]);

      const cart = cartData.status === "fulfilled" ? (cartData.value.items?.length || 0) : data.cartCount;
      const lastOrder = data.lastOrderId;
      const apiOk = healthData.status === "fulfilled" && healthData.value.ok === true;

      setData({
        cartCount: cart,
        lastOrderId: lastOrder,
        apiOnline: apiOk,
        ts: new Date().toLocaleTimeString("th-TH"),
      });
    } catch {}
    setLoading(false);
  }, []);

  // Listen for cart-updated events
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("cart-updated", handler);
    return () => window.removeEventListener("cart-updated", handler);
  }, [refresh]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-50 w-10 h-10 bg-gray-900/80 text-white rounded-full shadow-lg flex items-center justify-center text-sm font-bold hover:bg-gray-800 transition-all"
        title="เปิด Debug Panel"
      >
        🛠
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 bg-gray-900/90 backdrop-blur-md border border-gray-700 rounded-xl shadow-2xl p-4 w-64 text-xs font-mono text-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-bold text-white text-sm">🛠 Debug Monitor</span>
        <button onClick={() => setOpen(false)} className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-400">
          ✕
        </button>
      </div>

      {/* Live Data */}
      <div className="space-y-1.5">
        <div className="flex justify-between">
          <span className="text-gray-400">🛒 Cart Items</span>
          <span className="font-semibold text-cyan-300">{loading ? "..." : data.cartCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">🆔 Last Order</span>
          <span className="font-semibold text-yellow-300 truncate max-w-[120px] text-right">{data.lastOrderId}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">🌐 API Status</span>
          <span className={`font-semibold ${data.apiOnline ? "text-green-400" : "text-red-400"}`}>
            {data.apiOnline ? "🟢 Online" : "🔴 Offline"}
          </span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>⏱ Updated</span>
          <span>{data.ts || "-"}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 flex gap-1">
        <button onClick={refresh} className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-xs font-medium transition-colors">
          🔄 Refresh
        </button>
        <button
          onClick={async () => {
            const id = prompt("กรอกรหัสออเดอร์ล่าสุด:");
            if (id) setData(prev => ({ ...prev, lastOrderId: id }));
          }}
          className="flex-1 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 text-xs transition-colors"
        >
          ✏️ Set Order
        </button>
      </div>

      <p className="mt-2 text-gray-600 text-[9px]">Cache-busting: ✅ Active · Auto-refresh 30s</p>
    </div>
  );
}
