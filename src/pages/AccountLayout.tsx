import { useEffect, useState } from "react";
import { Link, useNavigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { apiClient } from "../lib/api";

const accountLinks = [
  { to: "/account", label: "ภาพรวม", icon: "📊", exact: true },
  { to: "/account/orders", label: "ออเดอร์ของฉัน", icon: "📋" },
  { to: "/account/profile", label: "ข้อมูลส่วนตัว", icon: "👤" },
];

export default function AccountLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [stats, setStats] = useState({ orders: 0, wishlist: 0, points: 0 });
  const [mobileSidebar, setMobileSidebar] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    apiClient("/api/account/stats")
      .then(d => {
        if (d.orders !== undefined) setStats(d);
      }).catch(() => {});
  }, [user]);

  const isActive = (link: typeof accountLinks[0]) => {
    if (link.exact) return location.pathname === link.to;
    return location.pathname.startsWith(link.to);
  };

  if (loading) return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="animate-pulse grid md:grid-cols-4 gap-8">
        <div className="md:col-span-1 h-64 bg-gray-100 rounded-2xl" />
        <div className="md:col-span-3 h-96 bg-gray-100 rounded-2xl" />
      </div>
    </div>
  );

  if (!user) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">สวัสดี, {user.fullName}</h1>
        <p className="text-sm text-gray-500 mt-1">จัดการบัญชีและดูออเดอร์ของคุณ</p>
      </div>

      <div className="lg:grid lg:grid-cols-4 lg:gap-8">
        {/* ===== Mobile: Horizontal Scroll Tabs ===== */}
        <div className="lg:hidden mb-6">
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {accountLinks.map((link) => {
              const active = isActive(link);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                    active
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <span>{link.icon}</span>
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* ===== Desktop: Sidebar ===== */}
        <div className="hidden lg:block lg:col-span-1">
          <div className="bg-white border border-gray-100 rounded-2xl p-4 sticky top-24 space-y-1">
            {accountLinks.map((link) => {
              const active = isActive(link);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <span className="text-lg">{link.icon}</span>
                  <span>{link.label}</span>
                  {link.to === "/account/orders" && stats.orders > 0 && (
                    <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                      {stats.orders}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* ===== Content ===== */}
        <div className="lg:col-span-3 min-h-[50vh]">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
