import { useEffect, useState, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useEventStream } from "../hooks/useEventStream";
import { apiClient } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface DashboardStats {
  totalProducts: number;
  totalOrders: number;
  totalRevenue: number;
  pendingOrders: number;
  todayRevenue: number;
  todayOrders: number;
  lowStockItems: number;
  outOfStock: number;
  forteProducts: number;
  topProducts: { productNameTh: string; totalSold: number; totalRevenue: number }[];
  recentOrders: any[];
}

const revenueData = [
  { day: "จ.", revenue: 12500 }, { day: "อ.", revenue: 18200 },
  { day: "พ.", revenue: 15800 }, { day: "พฤ.", revenue: 22100 },
  { day: "ศ.", revenue: 19400 }, { day: "ส.", revenue: 26800 },
  { day: "อา.", revenue: 14200 },
];

const menuGroups = [
  {
    group: "การจัดการ",
    items: [
      { path: "/seller/products", icon: "📦", label: "สินค้า", desc: "เพิ่ม/แก้ไข/ลบ" },
      { path: "/seller/pricing", icon: "💰", label: "ราคา", desc: "ตั้ง Margin" },
      { path: "/seller/batches", icon: "🏷️", label: "Batch/Lot", desc: "จัดการรุ่นสินค้า" },
      { path: "/seller/forte", icon: "🔄", label: "Forte Sync", desc: "ซิงค์จาก Forte" },
    ],
  },
  {
    group: "ออเดอร์",
    items: [
      { path: "/seller/orders", icon: "📋", label: "ออเดอร์", desc: "จัดการออเดอร์" },
      { path: "/seller/pos", icon: "🧾", label: "POS", desc: "ขายหน้าร้าน" },
      { path: "/seller/prescriptions", icon: "📄", label: "ใบสั่งยา", desc: "ตรวจสอบใบสั่งยา" },
      { path: "/seller/traceability", icon: "🔍", label: "ติดตาม", desc: "Trace Lot→Order" },
    ],
  },
  {
    group: "ลูกค้า & การเงิน",
    items: [
      { path: "/seller/customers", icon: "👥", label: "ลูกค้า", desc: "ข้อมูลลูกค้า" },
      { path: "/seller/accounting", icon: "💳", label: "บัญชี", desc: "รายรับ/รายจ่าย" },
      { path: "/seller/reports", icon: "📊", label: "รายงาน", desc: "ยอดขาย สถิติ" },
    ],
  },
  {
    group: "ระบบ",
    items: [
      { path: "/seller/settings", icon: "⚙️", label: "ตั้งค่า", desc: "ข้อมูลร้าน" },
      { path: "/seller/notifications", icon: "🔔", label: "แจ้งเตือน", desc: "ประวัติแจ้งเตือน" },
      { path: "/seller/audit-log", icon: "📝", label: "Audit Log", desc: "บันทึก Admin" },
      { path: "/seller/admin-users", icon: "👥", label: "ผู้ดูแล", desc: "จัดการสิทธิ์" },
    ],
  },
];

export default function SellerDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const canViewFinance = user?.role === "ADMIN" || user?.role === "SELLER" || user?.role === "SUPER_ADMIN";
  const filteredMenuGroups = menuGroups.map(g => ({
    ...g,
    items: g.group === "ลูกค้า & การเงิน" ? (canViewFinance ? g.items : []) : g.items,
  })).filter(g => g.items.length > 0);
  const { connected } = useEventStream({
    "dashboard-refresh": () => { loadStats(); loadLowStock(); },
    "order.created": () => { loadStats(); },
    "order.status.changed": () => { loadStats(); },
    "notification": () => { loadStats(); },
  });

  const loadLowStock = () => {
    apiClient("/api/seller/low-stock")
      .then(d => { setOutOfStockItems(d.outOfStock || []); setLowStockItems(d.lowStock || []); })
      .catch(() => {});
  };

  const loadStats = async () => {
    try {
      setLoading(true);
      const [statsData, lowStockData] = await Promise.all([
        apiClient("/api/seller/stats"),
        apiClient("/api/seller/low-stock"),
      ]);
      setStats(statsData);
      setOutOfStockItems(lowStockData.outOfStock || []);
      setLowStockItems(lowStockData.lowStock || []);
    } catch {}
    setLoading(false);
  };

  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [outOfStockItems, setOutOfStockItems] = useState<any[]>([]);
  const [lowStockLoading, setLowStockLoading] = useState(true);
  const [healthResult, setHealthResult] = useState<any>(null);
  const [healthRunning, setHealthRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const runHealthCheck = async () => {
    setHealthRunning(true);
    setHealthResult(null);
    try {
      const data = await apiClient("/api/health");
      const checks = Object.entries(data.checks || {}).map(([name, details]) => ({
        name: name === "db" ? "🗄️ Database" : name === "storage" ? "📁 Storage" : name === "forteSync" ? "🔄 Forte Sync" : name,
        passed: String(details).startsWith("ok"),
        details,
      }));
      const allOk = checks.every(c => c.passed);
      setHealthResult({
        status: allOk ? "healthy" : "issues_found",
        summary: allOk
          ? `✅ ทุกระบบปกติ (${checks.length}/${checks.length})`
          : `⚠️ พบ ${checks.filter(c => !c.passed).length} จุดที่ต้องตรวจสอบ`,
        checks,
      });
    } catch {
      setHealthResult({ status: "error", summary: "❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์" });
    }
    setHealthRunning(false);
  };

  useEffect(() => {
    loadStats();
    apiClient("/api/seller/low-stock")
      .then(d => { setOutOfStockItems(d.outOfStock || []); setLowStockItems(d.lowStock || []); })
      .catch(() => {})
      .finally(() => setLowStockLoading(false));
  }, []);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
      return (
        <div className="bg-white p-3 rounded-xl shadow-md border border-gray-100 text-sm">
          <p className="text-gray-500 mb-1">{label}</p>
          <p className="font-bold text-blue-600">฿{payload[0].value.toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Top Bar */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-gray-100 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">
            <span className="text-blue-600">Pharma</span>Care
            <span className="ml-2 text-sm font-normal text-gray-400">— หลังร้าน</span>
            {user?.role && (
              <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                canViewFinance ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"
              }`}>
                {user.role === "SUPER_ADMIN" ? "SuperAdmin" : user.role === "SELLER" ? "Manager" : user.role === "ADMIN" ? "Admin" : user.role}
              </span>
            )}
          </h1>
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
              connected ? "bg-green-50 text-green-700" : "bg-red-50 text-red-500"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
              {connected ? "Real-time" : "Disconnected"}
            </span>
            <button onClick={runHealthCheck} disabled={healthRunning}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50">
              🩺 {healthRunning ? "..." : "Health"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {/* 🔴 Alert Banners — Premium */}
        {!lowStockLoading && (outOfStockItems.length > 0 || lowStockItems.length > 0) && (
          <div className="mb-6 space-y-2">
            {outOfStockItems.length > 0 && (
              <Link to="/seller/products"
                className="group flex items-center gap-4 p-4 bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-xl hover:from-red-100 hover:to-orange-100 transition-all shadow-sm">
                <span className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-lg shrink-0">🔴</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-red-700 text-sm">
                    สินค้าหมดสต็อก {outOfStockItems.length} รายการ
                  </p>
                  <p className="text-xs text-red-500 mt-0.5">คลิกเพื่อจัดการสินค้าที่หมด</p>
                </div>
                <span className="text-sm text-red-500 group-hover:translate-x-0.5 transition-transform">→</span>
              </Link>
            )}
            {lowStockItems.length > 0 && (
              <Link to="/seller/products"
                className="group flex items-center gap-4 p-4 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl hover:from-amber-100 hover:to-yellow-100 transition-all shadow-sm">
                <span className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-lg shrink-0">🟡</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-amber-700 text-sm">
                    สินค้าใกล้หมด {lowStockItems.length} รายการ
                  </p>
                  <p className="text-xs text-amber-500 mt-0.5">คลิกเพื่อตรวจสอบสต็อกคงเหลือ</p>
                </div>
                <span className="text-sm text-amber-500 group-hover:translate-x-0.5 transition-transform">→</span>
              </Link>
            )}
          </div>
        )}

        {/* Stats Cards */}
              {/* Stats Cards */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse h-24" />
            ))}
          </div>
        ) : stats ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-100">
                <p className="text-xs text-blue-600 font-medium">ออเดอร์วันนี้</p>
                <p className="text-2xl font-bold text-blue-700 mt-1">{stats.todayOrders}</p>
                <p className="text-xs text-blue-500 mt-1">ยอด ฿{(stats.todayRevenue || 0).toLocaleString()}</p>
              </div>
              {canViewFinance && (
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-100">
                <p className="text-xs text-green-600 font-medium">รายได้รวม</p>
                <p className="text-2xl font-bold text-green-700 mt-1">฿{(stats.totalRevenue || 0).toLocaleString()}</p>
              </div>
              )}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-100">
                <p className="text-xs text-purple-600 font-medium">สินค้า</p>
                <p className="text-2xl font-bold text-purple-700 mt-1">{stats.totalProducts}</p>
                <p className="text-xs text-purple-500 mt-1">{stats.forteProducts} จาก Forte</p>
              </div>
              <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-100">
                <p className="text-xs text-amber-600 font-medium">รอดำเนินการ</p>
                <p className="text-2xl font-bold text-amber-700 mt-1">{stats.pendingOrders}</p>
                <p className="text-xs text-amber-500 mt-1">ออเดอร์รอยืนยัน</p>
              </div>
            </div>

            {/* Revenue Chart */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span>📈</span> รายได้ย้อนหลัง 7 วัน
              </h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `฿${(v/1000).toFixed(0)}k` : `฿${v}`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2.5} dot={{ fill: "#3b82f6", strokeWidth: 2, r: 4 }} activeDot={{ r: 6, fill: "#3b82f6" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Products */}
            {stats.topProducts?.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-4">🏆 สินค้าขายดี</h3>
                <div className="space-y-2">
                  {stats.topProducts.slice(0, 5).map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white
                          ${i === 0 ? 'bg-yellow-500' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-amber-700' : 'bg-blue-100 text-blue-600'}`}>
                          {i + 1}
                        </span>
                        <span className="text-gray-700">{p.productNameTh}</span>
                      </div>
                      <span className="text-gray-500 text-xs">ขาย {p.totalSold} · ฿{Number(p.totalRevenue).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}

        {/* Mobile-optimized: scrollable slider menu */}
        <div className="mb-6 space-y-6">
          {filteredMenuGroups.map((group) => (
            <div key={group.group}>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">{group.group}</h3>
              {/* Desktop: grid; Mobile: horizontal scroll */}
              <div
                ref={scrollRef}
                className="flex md:grid md:grid-cols-3 lg:grid-cols-4 gap-3 overflow-x-auto pb-2 md:pb-0 snap-x snap-mandatory scrollbar-hide"
                style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}
              >
                {group.items.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`snap-start shrink-0 w-44 md:w-auto flex items-center gap-3 p-4 rounded-xl border transition-all
                        ${isActive
                          ? "bg-blue-50 border-blue-200 shadow-sm"
                          : "bg-white border-gray-100 hover:shadow-md hover:border-blue-200"
                        }`}
                    >
                      <span className="text-2xl">{item.icon}</span>
                      <div>
                        <p className={`font-medium text-sm ${isActive ? "text-blue-700" : "text-gray-900"}`}>
                          {item.label}
                        </p>
                        <p className="text-xs text-gray-400">{item.desc}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Health Check (mobile) */}
        <div className="sm:hidden">
          <button onClick={runHealthCheck} disabled={healthRunning}
            className="flex items-center gap-2 w-full px-4 py-3 bg-white border border-gray-100 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50 shadow-sm">
            <span>{healthRunning ? "⏳" : "🩺"}</span>
            {healthRunning ? "กำลังตรวจสอบ..." : "Run System Health Check"}
          </button>
          {healthResult && (
            <div className={`mt-3 p-4 rounded-xl border text-sm ${
              healthResult.status === "healthy" ? "bg-green-50 border-green-200 text-green-700" :
              healthResult.status === "issues_found" ? "bg-amber-50 border-amber-200 text-amber-700" :
              "bg-red-50 border-red-200 text-red-700"
            }`}>
              <p className="font-medium mb-2">{healthResult.summary}</p>
              {healthResult.checks?.map((c: any, i: number) => (
                <div key={i} className="flex items-center gap-2 py-1">
                  <span>{c.passed ? "✅" : "❌"}</span>
                  <span className="text-xs">{c.name}: {c.details}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Health check (desktop) — placed in line with top bar */}
        {healthResult && (
          <div className={`hidden sm:block mt-6 p-4 rounded-xl border text-sm ${
            healthResult.status === "healthy" ? "bg-green-50 border-green-200 text-green-700" :
            healthResult.status === "issues_found" ? "bg-amber-50 border-amber-200 text-amber-700" :
            "bg-red-50 border-red-200 text-red-700"
          }`}>
            <p className="font-medium mb-2">{healthResult.summary}</p>
            <div className="grid grid-cols-2 gap-2">
              {healthResult.checks?.map((c: any, i: number) => (
                <div key={i} className="flex items-center gap-2 py-1">
                  <span>{c.passed ? "✅" : "❌"}</span>
                  <span className="text-xs">{c.name}: {c.details}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
