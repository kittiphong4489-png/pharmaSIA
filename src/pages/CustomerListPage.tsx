import { useEffect, useState, useCallback } from "react";
import { apiClient } from "../lib/api";
import { Link } from "react-router-dom";
import Pagination from "../components/Pagination";

interface Customer {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  customerCode: string | null;
  role: string;
  tier: string;
  isActive: number;
  createdAt: string;
  orderCount: number;
  totalSpent: number;
}

const getAuthHeaders = () => {
  const token = localStorage.getItem("pharma_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const TIER_LABELS: Record<string, string> = {
  INDIVIDUAL: "บุคคลทั่วไป",
  RETAIL: "ร้านขายยา",
  CLINIC: "คลินิก",
};

const TIER_COLORS: Record<string, string> = {
  INDIVIDUAL: "text-blue-600 bg-blue-50",
  RETAIL: "text-green-600 bg-green-50",
  CLINIC: "text-purple-600 bg-purple-50",
};

export default function CustomerListPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState("newest");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      params.set("page", String(page));
      params.set("limit", "20");
      params.set("sort", sort);
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);

      try {
        const data = await apiClient(`/api/customers?${params.toString()}`);
        if (data.customers) {
          setCustomers(data.customers);
          setTotal(data.total || 0);
          setTotalPages(data.totalPages || 1);
        }
      } catch (e: any) {
        setError(e?.message || "เกิดข้อผิดพลาด");
      }
    } catch {}
    setLoading(false);
  }, [search, page, sort, fromDate, toDate]);

  useEffect(() => {
    fetchCustomers();
  }, [page, sort, fromDate, toDate]);

  const handleSearch = () => {
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">👥 ศูนย์ข้อมูลลูกค้า</h1>
          <p className="text-sm text-gray-500">จัดการและค้นหาข้อมูลลูกค้าทั้งหมด</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/export/customers.csv"
            onClick={(e) => {
              e.preventDefault();
              const t = localStorage.getItem("pharma_token");
              fetch("/api/export/customers.csv", { headers: t ? { Authorization: `Bearer ${t}` } : {} })
                .then(r => r.blob())
                .then(blob => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "customers.csv"; a.click(); URL.revokeObjectURL(a.href); })
                .catch(() => {});
            }}
            className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700"
          >
            📥 Export CSV
          </a>
          <Link
            to="/seller"
            className="text-sm text-blue-600 hover:underline"
          >
            ← กลับแดชบอร์ด
          </Link>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="ค้นหาลูกค้า (ชื่อ, อีเมล, เบอร์โทร, รหัสลูกค้า)..."
              className="w-full border rounded-lg px-3 py-2 pr-10 text-sm"
            />
            {search && (
              <button
                onClick={() => { setSearch(""); setPage(1); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            🔍 ค้นหา
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-2 rounded-lg border text-sm ${
              showFilters || fromDate || toDate
                ? "bg-blue-50 border-blue-200 text-blue-700"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            ⚙️ ตัวกรอง
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">วันที่เริ่มต้น</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">วันที่สิ้นสุด</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">เรียงตาม</label>
              <select
                value={sort}
                onChange={(e) => { setSort(e.target.value); setPage(1); }}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="newest">ล่าสุด</option>
                <option value="oldest">ล่าสุดกลับ</option>
                <option value="name">ชื่อ A-Z</option>
                <option value="orders_desc">ออเดอร์มาก→น้อย</option>
                <option value="orders_asc">ออเดอร์น้อย→มาก</option>
                <option value="spent_desc">ยอดรวมมาก→น้อย</option>
                <option value="spent_asc">ยอดรวมน้อย→มาก</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => { setFromDate(""); setToDate(""); setSort("newest"); setPage(1); }}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                ✕ ล้างตัวกรอง
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Results Info */}
      <div className="text-sm text-gray-500 mb-3">
        {loading ? "กำลังโหลด..." : `พบลูกค้าทั้งหมด ${total} ราย`}
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">กำลังโหลดข้อมูลลูกค้า...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-xl mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          {customers.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              {search || fromDate || toDate
                ? "ไม่พบลูกค้าที่ตรงกับเงื่อนไขการค้นหา"
                : "ยังไม่มีข้อมูลลูกค้า"}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">รหัสลูกค้า</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">ชื่อ</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">อีเมล</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">เบอร์โทร</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">Tier</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">สถานะ</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">วันที่สมัคร</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">ออเดอร์</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">ยอดรวม</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr
                        key={c.id}
                        className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-blue-600">
                          {c.customerCode || "-"}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <Link
                            to={`/seller/customers/${c.id}`}
                            className="hover:text-blue-600"
                          >
                            {c.fullName}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {c.email || "-"}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {c.phone || "-"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              TIER_COLORS[c.tier] || "text-gray-600 bg-gray-50"
                            }`}
                          >
                            {TIER_LABELS[c.tier] || c.tier}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              c.isActive
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {c.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-gray-500">
                          {c.createdAt ? new Date(c.createdAt).toLocaleDateString("th-TH") : "-"}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {c.orderCount}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm">
                          ฿{(c.totalSpent || 0).toLocaleString("th-TH", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Link
                            to={`/seller/customers/${c.id}`}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium hover:underline"
                          >
                            รายละเอียด →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
