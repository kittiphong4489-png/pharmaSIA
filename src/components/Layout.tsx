import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useEffect, useState, useRef, useCallback } from "react";
import SearchOverlay from "./SearchOverlay";
import ChatWidget from "./ChatWidget";
import { getSessionId } from "../lib/session";
import { useEventStream } from "../hooks/useEventStream";
import NotificationBell from "./NotificationBell";
import { useSettings, getStoreDisplayName, getStoreLogo } from "../contexts/SettingsContext";
import { apiClient } from "../lib/api";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // SSE connection (auto-reconnects)
  useEventStream({});

  const fetchCartCount = useCallback(async () => {
    try {
      const d = await apiClient(`/api/cart?sessionId=${getSessionId()}`);
      setCartCount(d.items?.length || 0);
    } catch { setCartCount(0); }
  }, []);

  // Fetch cart count on mount and on route change
  useEffect(() => { fetchCartCount(); }, [fetchCartCount, location.pathname]);
  // Listen for cart updates
  useEffect(() => {
    const h = () => fetchCartCount();
    window.addEventListener("cart-updated", h);
    return () => window.removeEventListener("cart-updated", h);
  }, [fetchCartCount]);

  // Close user menu dropdown
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // Set page title based on route
  useEffect(() => {
    const titles: Record<string, string> = {
      "/": "หน้าแรก",
      "/products": "สินค้า",
      "/cart": "ตะกร้าสินค้า",
      "/login": "เข้าสู่ระบบ",
      "/account/orders": "คำสั่งซื้อ",
      "/account/profile": "บัญชีของฉัน",
      "/account": "แดชบอร์ด",
      "/seller": "ร้านค้า",
      "/seller/orders": "จัดการออเดอร์",
      "/seller/pricing": "กำหนดราคา",
      "/seller/batches": "Batch/Lot",
      "/seller/products": "จัดการสินค้า",
      "/seller/settings": "ตั้งค่าร้าน",
    };
    const path = location.pathname;
    if (path.startsWith("/products/")) document.title = "รายละเอียดสินค้า | PharmaSIA Ltd. Part.";
    else if (path.startsWith("/seller")) document.title = "ร้านค้า | PharmaSIA Ltd. Part.";
    else document.title = (titles[path] || "") + (titles[path] ? " | PharmaSIA Ltd. Part." : "PharmaSIA Ltd. Part.");
  }, [location.pathname]);

  const isAdmin = user && (user.role === "SELLER" || user.role === "ADMIN");

  const navLinks = [
    { to: "/", label: "หน้าแรก" },
    { to: "/products", label: "สินค้า" },
  ];
  if (isAdmin) navLinks.push({ to: "/seller", label: "ร้านค้า" });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Left: Logo + Nav */}
            <div className="flex items-center gap-6">
              <Link to="/" className="flex items-center gap-2.5 shrink-0">
                {getStoreLogo(settings) ? (
                  <img src={getStoreLogo(settings)!} alt={getStoreDisplayName(settings)}
                    className="w-8 h-8 rounded-lg object-contain" />
                ) : (
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-sm">
                    <span className="text-white font-bold text-sm">{getStoreDisplayName(settings).charAt(0)}</span>
                  </div>
                )}
                <span className="text-lg font-bold text-gray-900 hidden sm:block">{getStoreDisplayName(settings)}</span>
              </Link>
              <nav className="hidden md:flex items-center gap-1">
                {navLinks.map((link) => {
                  const isActive = location.pathname === link.to ||
                    (link.to !== "/" && location.pathname.startsWith(link.to));
                  return (
                    <Link key={link.to} to={link.to}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        isActive ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                      }`}>
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1">
              {/* Mobile menu toggle */}
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-all">
                {mobileMenuOpen ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
              <button onClick={() => setSearchOpen(true)}
                className="p-2.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>

              <Link to="/cart"
                className="relative p-2.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                </svg>
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
              </Link>

              {/* Notification Bell — extracted component */}
              <NotificationBell />

              {/* User Menu */}
              {loading ? (
                <div className="w-8 h-8 bg-gray-100 rounded-full animate-pulse" />
              ) : user ? (
                <div className="hidden sm:flex items-center gap-1">
                  <Link to="/account/orders" className="p-2.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-all" title="คำสั่งซื้อ">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </Link>

                  <div ref={userMenuRef} className="relative">
                    <button onClick={() => { setUserMenuOpen(!userMenuOpen); }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-blue-50 transition-colors">
                      <div className="w-6 h-6 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">{user.fullName?.[0] || "U"}</span>
                      </div>
                      <span className="text-sm font-medium text-gray-700 max-w-[100px] truncate">{user.fullName}</span>
                    </button>

                    {userMenuOpen && (
                      <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl border border-gray-100 shadow-lg overflow-hidden z-50">
                        <div className="p-3 border-b border-gray-100">
                          <p className="text-sm font-semibold text-gray-900 truncate">{user.fullName}</p>
                          <p className="text-xs text-gray-400 truncate">{user.email}</p>
                        </div>
                        <div className="py-1">
                          <Link to="/account/orders" onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            คำสั่งซื้อของฉัน
                          </Link>
                          <Link to="/account/profile" onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            บัญชีของฉัน
                          </Link>
                          {isAdmin && (
                            <Link to="/seller" onClick={() => setUserMenuOpen(false)}
                              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 transition-colors border-t border-gray-50 mt-1 pt-2">
                              <div className="w-4 h-4 bg-gradient-to-br from-blue-400 to-blue-600 rounded flex items-center justify-center">
                                <span className="text-white text-[8px] font-bold">S</span>
                              </div>
                              <span className="font-medium">หลังร้าน</span>
                            </Link>
                          )}
                        </div>
                        <div className="border-t border-gray-100 p-1">
                          <button onClick={() => { logout(); setUserMenuOpen(false); }}
                            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            ออกจากระบบ
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <Link to="/login"
                  className="hidden sm:inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-blue-600 hover:to-blue-700 shadow-sm hover:shadow transition-all">
                  เข้าสู่ระบบ
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-16 z-40 bg-white border-b border-gray-100 overflow-y-auto">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.to || (link.to !== "/" && location.pathname.startsWith(link.to));
              return (
                <Link key={link.to} to={link.to} onClick={() => setMobileMenuOpen(false)}
                  className={`block px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    isActive ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"
                  }`}>
                  {link.label}
                </Link>
              );
            })}
            {user ? (
              <>
                <hr className="my-2 border-gray-100" />
                <Link to="/cart" onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 rounded-lg relative">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                  </svg>
                  ตะกร้าสินค้า
                  {cartCount > 0 && (
                    <span className="ml-auto bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                      {cartCount > 99 ? "99+" : cartCount}
                    </span>
                  )}
                </Link>
                <Link to="/account/orders" onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  คำสั่งซื้อ
                </Link>
                <Link to="/account/profile" onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  บัญชีของฉัน
                </Link>
                {isAdmin && (
                  <Link to="/seller" onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-blue-600 hover:bg-blue-50 rounded-lg font-medium">
                    <div className="w-5 h-5 bg-gradient-to-br from-blue-400 to-blue-600 rounded flex items-center justify-center">
                      <span className="text-white text-[9px] font-bold">S</span>
                    </div>
                    หลังร้าน
                  </Link>
                )}
                <hr className="my-2 border-gray-100" />
                <button onClick={() => { logout(); setMobileMenuOpen(false); }}
                  className="flex items-center gap-3 w-full px-4 py-3 text-sm text-red-600 hover:bg-red-50 rounded-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  ออกจากระบบ
                </button>
              </>
            ) : (
              <>
                <hr className="my-2 border-gray-100" />
                <Link to="/login" onClick={() => setMobileMenuOpen(false)}
                  className="block px-4 py-3 text-sm text-blue-600 hover:bg-blue-50 rounded-lg font-medium text-center">
                  เข้าสู่ระบบ
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      {settings !== null && (
        <footer className="bg-white border-t border-gray-100 mt-12">
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="text-center">
              <p className="text-sm text-gray-500">{settings?.footer || "ขอบคุณที่ใช้บริการ"}</p>
              <div className="flex items-center justify-center gap-4 mt-2 text-xs text-gray-400">
                {settings?.storePhone && <span>โทร: {settings.storePhone}</span>}
                {settings?.storeEmail && <span>อีเมล: {settings.storeEmail}</span>}
              </div>
            </div>
          </div>
        </footer>
      )}

      <ChatWidget />
    </div>
  );
}
