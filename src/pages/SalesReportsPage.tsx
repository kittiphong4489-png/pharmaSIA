import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

export default function SalesReportsPage() {
  const [tab, setTab] = useState<"daily" | "monthly" | "top">("daily");
  const [salesData, setSalesData] = useState<any>(null);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [topLoading, setTopLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [dateRange, setDateRange] = useState("90");

  // Load stats
  useEffect(() => {
    apiClient("/api/seller/stats")
      .then(data => { setStats(data); }).catch(() => {});
  }, []);

  // Load sales data
  useEffect(() => {
    setLoading(true);
    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - parseInt(dateRange) * 86400000).toISOString().split("T")[0];
    const p = tab === "monthly" ? "monthly" : "daily";
    apiClient(`/api/seller/reports/sales?period=${p}&startDate=${startDate}&endDate=${endDate}`)
      .then(data => {
      setSalesData(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [tab, dateRange]);

  // Load top products
  useEffect(() => {
    if (tab !== "top") return;
    setTopLoading(true);
    apiClient("/api/seller/reports/top-products?limit=10")
      .then(data => {
      setTopProducts(data.topProducts || []);
      setTopLoading(false);
    }).catch(() => setTopLoading(false));
  }, [tab]);

  // Transform for Recharts
  const chartData = salesData?.labels?.map((label: string, i: number) => ({
    label,
    ยอดขาย: salesData.data[i],
    ออเดอร์: salesData.orderCounts?.[i] || 0,
  })) || [];

  const totalRevenue = salesData?.data?.reduce((a: number, b: number) => a + b, 0) || 0;
  const totalOrders = salesData?.orderCounts?.reduce((a: number, b: number) => a + b, 0) || 0;

  const dateRangeOptions = [
    { value: "30", label: "30 วัน" },
    { value: "90", label: "90 วัน" },
    { value: "180", label: "6 เดือน" },
    { value: "365", label: "1 ปี" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">รายงานยอดขาย</h1>
          <p className="text-sm text-gray-500">วิเคราะห์ยอดขายพร้อมกราฟ</p>
        </div>
      </div>

      {/* Summary cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-xs text-gray-500 mb-1">รายได้รวมทั้งหมด</p>
            <p className="text-2xl font-bold text-gray-900">฿{(stats.totalRevenue || 0).toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-xs text-gray-500 mb-1">ออเดอร์ทั้งหมด</p>
            <p className="text-2xl font-bold text-gray-900">{stats.totalOrders || 0}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-xs text-gray-500 mb-1">รายได้วันนี้</p>
            <p className="text-2xl font-bold text-blue-600">฿{(stats.todayRevenue || 0).toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-xs text-gray-500 mb-1">ออเดอร์วันนี้</p>
            <p className="text-2xl font-bold text-blue-600">{stats.todayOrders || 0}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-100 pb-2">
        <button onClick={() => setTab("daily")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "daily" ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
          }`}>
          📊 ยอดขายรายวัน
        </button>
        <button onClick={() => setTab("monthly")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "monthly" ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
          }`}>
          📈 สรุปตามเดือน
        </button>
        <button onClick={() => setTab("top")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "top" ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
          }`}>
          🏆 สินค้าขายดี
        </button>
      </div>

      {/* Sales Chart Tab */}
      {(tab === "daily" || tab === "monthly") && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">
              {tab === "daily" ? "📊 ยอดขายรายวัน" : "📈 ยอดขายตามเดือน"}
            </h3>
            <div className="flex items-center gap-3">
              {/* Date range selector */}
              {tab === "daily" && (
                <select value={dateRange} onChange={e => setDateRange(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-gray-50 text-gray-600">
                  {dateRangeOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              )}
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>รวม: <strong className="text-gray-900">฿{totalRevenue.toLocaleString()}</strong></span>
                <span className="text-gray-300">|</span>
                <span>ออเดอร์: <strong className="text-gray-900">{totalOrders}</strong></span>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="h-80 flex items-center justify-center text-gray-400 animate-pulse">กำลังโหลดกราฟ...</div>
          ) : chartData.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `฿${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                      fontSize: "13px",
                    }}
                    formatter={(value: number) => [`฿${value.toLocaleString()}`, "ยอดขาย"]}
                  />
                  <Bar dataKey="ยอดขาย" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-80 flex items-center justify-center text-gray-400">ไม่มีข้อมูลยอดขายในช่วงเวลานี้</div>
          )}

          {/* Sales data table */}
          {chartData.length > 0 && (
            <div className="mt-6 max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-400 border-b border-gray-100 sticky top-0 bg-white">
                  <tr>
                    <th className="pb-2 font-medium">ช่วงเวลา</th>
                    <th className="pb-2 font-medium text-right">ยอดขาย</th>
                    <th className="pb-2 font-medium text-right">ออเดอร์</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((row: any) => (
                    <tr key={row.label} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-2 text-gray-700">{row.label}</td>
                      <td className="py-2 text-right font-medium text-gray-900">฿{row.ยอดขาย.toLocaleString()}</td>
                      <td className="py-2 text-right text-gray-500">{row.ออเดอร์}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Top Products Tab */}
      {tab === "top" && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-900 mb-6">🏆 สินค้าขายดี Top 10</h3>

          {topLoading ? (
            <div className="py-12 text-center text-gray-400 animate-pulse">กำลังโหลด...</div>
          ) : topProducts.length === 0 ? (
            <div className="py-12 text-center text-gray-400">ไม่มีข้อมูลสินค้าขายดี</div>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p: any, i: number) => {
                const maxSold = topProducts[0]?.totalSold || 1;
                const barWidth = Math.max(5, (p.totalSold / maxSold) * 100);
                return (
                  <div key={p.productId || i} className="flex items-center gap-4">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${
                      i === 0 ? "bg-amber-500" : i === 1 ? "bg-gray-400" : i === 2 ? "bg-amber-700" : "bg-gray-200 text-gray-600"
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-800 truncate">{p.productNameTh || p.productNameEn}</span>
                        <span className="text-xs text-gray-400 ml-2 flex-shrink-0">x{p.totalSold}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${barWidth}%`,
                            background: i === 0
                              ? "linear-gradient(90deg, #f59e0b, #d97706)"
                              : i === 1
                              ? "linear-gradient(90deg, #9ca3af, #6b7280)"
                              : i === 2
                              ? "linear-gradient(90deg, #b45309, #92400e)"
                              : "linear-gradient(90deg, #93c5fd, #60a5fa)"
                          }} />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-gray-900">฿{Number(p.totalRevenue).toLocaleString()}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Monthly summary cards */}
      {tab === "monthly" && chartData.length > 0 && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {chartData.map((row: any) => (
            <div key={row.label} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-shadow">
              <p className="text-sm text-gray-500 mb-1">{row.label}</p>
              <p className="text-lg font-bold text-gray-900">฿{row.ยอดขาย.toLocaleString()}</p>
              <p className="text-xs text-gray-400">{row.ออเดอร์} ออเดอร์</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
