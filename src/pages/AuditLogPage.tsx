import { useEffect, useState, useCallback } from "react";
import { apiClient } from "../lib/api";

interface AuditLogEntry {
  id: number;
  userId: number;
  adminName: string;
  adminRole: string;
  action: string;
  entityType: string;
  entityId: number | null;
  details: string;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  delete_product: "ลบสินค้า",
  change_order_status: "เปลี่ยนสถานะออเดอร์",
  change_price: "เปลี่ยนราคา",
  change_customer_password: "เปลี่ยนรหัสลูกค้า",
};

const ACTION_COLORS: Record<string, string> = {
  delete_product: "bg-red-100 text-red-700",
  change_order_status: "bg-blue-100 text-blue-700",
  change_price: "bg-amber-100 text-amber-700",
  change_customer_password: "bg-purple-100 text-purple-700",
};

const ENTITY_LABELS: Record<string, string> = {
  product: "สินค้า",
  order: "ออเดอร์",
  user: "ลูกค้า",
};

const getAuthHeaders = () => {
  const token = localStorage.getItem("pharma_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (actionFilter) params.set("action", actionFilter);
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);

      const data = await apiClient(`/api/admin/audit-log?${params}`, {
        headers: getAuthHeaders(),
      });
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (e: any) {
      console.error(e);
    }
    setLoading(false);
  }, [page, actionFilter, fromDate, toDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">📝 Audit Log</h1>
          <p className="text-sm text-gray-500">บันทึกการดำเนินการของ Admin</p>
        </div>
        {total > 0 && <span className="text-sm text-gray-400">{total} รายการ</span>}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">การกระทำ</label>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">ทั้งหมด</option>
              <option value="delete_product">ลบสินค้า</option>
              <option value="change_order_status">เปลี่ยนสถานะออเดอร์</option>
              <option value="change_price">เปลี่ยนราคา</option>
              <option value="change_customer_password">เปลี่ยนรหัสลูกค้า</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">วันที่เริ่มต้น</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">วันที่สิ้นสุด</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { setActionFilter(""); setFromDate(""); setToDate(""); setPage(1); }}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
            >
              ✕ ล้างตัวกรอง
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">กำลังโหลด...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <div className="text-4xl mb-2">📝</div>
          <p className="text-gray-400">ไม่พบรายการ Audit Log</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">เวลา</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Admin</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">การกระทำ</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Entity</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("th-TH")}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <span>{log.adminName || `Admin #${log.userId}`}</span>
                        {log.adminRole && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            log.adminRole === "SUPER_ADMIN" ? "bg-purple-100 text-purple-700" :
                            log.adminRole === "SELLER" ? "bg-blue-100 text-blue-700" :
                            "bg-gray-100 text-gray-600"
                          }`}>
                            {log.adminRole}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[log.action] || "bg-gray-100 text-gray-600"}`}>
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {ENTITY_LABELS[log.entityType] || log.entityType}
                      {log.entityId ? ` #${log.entityId}` : ""}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-md truncate">
                      {log.details || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← ก่อนหน้า
              </button>
              <span className="text-sm text-gray-500">
                หน้า {page} จาก {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ถัดไป →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
