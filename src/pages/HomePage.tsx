import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { apiClient } from "../lib/api";
import { Pill, Leaf, Apple, Droplets, Stethoscope, Baby, Wind, Coffee, PawPrint, Package, ShoppingBag, ChevronRight, ShieldCheck, Truck, CreditCard, TrendingUp, Phone, Mail, MessageCircle, LogIn, User } from "lucide-react";

const CATEGORIES = [
  { id: 1, name: "ยา", count: "2,500+", icon: Pill, gradient: "from-blue-50 to-blue-100", iconColor: "text-blue-600" },
  { id: 2, name: "ยาแผนโบราณ", count: "280+", icon: Leaf, gradient: "from-emerald-50 to-emerald-100", iconColor: "text-emerald-600" },
  { id: 3, name: "อาหารเสริม", count: "530+", icon: Apple, gradient: "from-teal-50 to-teal-100", iconColor: "text-teal-600" },
  { id: 4, name: "เวชสำอาง", count: "400+", icon: Droplets, gradient: "from-pink-50 to-pink-100", iconColor: "text-pink-600" },
  { id: 5, name: "เวชภัณฑ์", count: "900+", icon: Stethoscope, gradient: "from-indigo-50 to-indigo-100", iconColor: "text-indigo-600" },
  { id: 6, name: "แม่และเด็ก", count: "160+", icon: Baby, gradient: "from-violet-50 to-violet-100", iconColor: "text-violet-600" },
  { id: 7, name: "ของใช้", count: "230+", icon: Wind, gradient: "from-amber-50 to-amber-100", iconColor: "text-amber-600" },
  { id: 8, name: "เครื่องดื่ม", count: "75+", icon: Coffee, gradient: "from-orange-50 to-orange-100", iconColor: "text-orange-600" },
  { id: 9, name: "สัตว์เลี้ยง", count: "15+", icon: PawPrint, gradient: "from-lime-50 to-lime-100", iconColor: "text-lime-600" },
  { id: 10, name: "อื่นๆ", count: "650+", icon: Package, gradient: "from-gray-50 to-gray-100", iconColor: "text-gray-600" },
];

const HERO_SLIDES = [
  { bg: "from-blue-600 to-indigo-700", title: "PharmaSIA", subtitle: "สินค้าของแท้ ได้มาตรฐาน ราคายุติธรรม" },
  { bg: "from-emerald-600 to-teal-700", title: "มากกว่า 6,000 รายการ", subtitle: "ยาจริง เวชภัณฑ์ อาหารเสริม พร้อมจัดส่ง" },
  { bg: "from-violet-600 to-purple-700", title: "โปรโมชั่นพิเศษ", subtitle: "ส่วนลดค่าส่ง 50% เมื่อสั่ง 500+" },
];

export default function HomePage() {
  const { user } = useAuth();
  const [featured, setFeatured] = useState<any[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [slide, setSlide] = useState(0);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [recentlyLoading, setRecentlyLoading] = useState(true);

  useEffect(() => {
    setFeaturedLoading(true);
    apiClient("/api/products/featured?limit=8").then(d => { setFeatured(d.items || []); setFeaturedLoading(false); }).catch(() => { setFeaturedLoading(false); });
    const token = localStorage.getItem("pharma_token");
    if (token) {
      setRecentlyLoading(true);
      apiClient("/api/products/recently-viewed")
        .then(d => { setRecentlyViewed(d.items || []); setRecentlyLoading(false); }).catch(() => { setRecentlyLoading(false); });
    } else {
      setRecentlyLoading(false);
    }
    const t = setInterval(() => setSlide(s => (s + 1) % HERO_SLIDES.length), 5000);
    return () => clearInterval(t);
  }, []);

  const s = settings;

  // ── ไม่ได้ Login: หน้าแรกแบบแนะนำตัว ──
  if (!user) {
    return (
      <div className="bg-white">
        <section className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white overflow-hidden">
          {/* Store Photo Background */}
          {s?.storeImage && (
            <div className="absolute inset-0 opacity-20">
              <img src={s.storeImage} alt={s.storeName || "ร้านยา"} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="relative max-w-6xl mx-auto px-6 py-20 md:py-28">
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="flex-1 max-w-2xl">
                <div className="w-14 h-14 bg-white/15 backdrop-blur rounded-2xl flex items-center justify-center mb-6">
                  <ShoppingBag className="w-7 h-7 text-white" />
                </div>
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">{s?.storeName || "PharmaSIA"}</h1>
                <p className="text-lg text-blue-100 mb-2 leading-relaxed">{s?.storeType || "ร้านขายยาแผนปัจจุบัน"} — ได้รับอนุญาต</p>
                <p className="text-sm text-blue-200 mb-8">{s?.storeAddress || ""}</p>
                <div className="flex flex-wrap gap-3">
                  <Link to="/login" className="inline-flex items-center gap-2 bg-white text-blue-700 font-semibold px-6 py-3.5 rounded-xl hover:shadow-lg transition-all text-sm">
                    <LogIn className="w-4 h-4" /> เข้าสู่ระบบ / สมัครสมาชิก
                  </Link>
                  {s?.storePhone && (
                    <a href={`tel:${s.storePhone}`} className="inline-flex items-center gap-2 bg-white/10 backdrop-blur text-white font-semibold px-6 py-3.5 rounded-xl hover:bg-white/20 transition-all text-sm border border-white/20">
                      <Phone className="w-4 h-4" /> {s.storePhone}
                    </a>
                  )}
                </div>
              </div>
              {/* Store Photo Card */}
              <div className="hidden md:block shrink-0">
                <div className="w-64 h-48 rounded-2xl overflow-hidden shadow-2xl border-4 border-white/30 backdrop-blur">
                  {s?.storeImage ? (
                    <img src={s.storeImage} alt={s.storeName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-white/10 flex items-center justify-center text-5xl">🏪</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="border-b border-gray-100">
          <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-gray-500">
            <span className="flex items-center gap-2"><Truck className="w-4 h-4 text-blue-500" /> ค่าส่งตามน้ำหนัก</span>
            <span className="flex items-center gap-2"><CreditCard className="w-4 h-4 text-blue-500" /> สั่ง 500+ ลดค่าส่ง 50%</span>
            <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-blue-500" /> สินค้าของแท้</span>
          </div>
        </section>
        <section className="max-w-6xl mx-auto px-6 py-12">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">ยินดีต้อนรับ</h2>
            <p className="text-gray-400 mt-1 text-sm">กรุณาเข้าสู่ระบบหรือสมัครสมาชิกเพื่อดูสินค้าและราคาจริง</p>
          </div>
          <div className="text-center">
            <Link to="/login" className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold px-8 py-4 rounded-xl hover:bg-blue-700 transition-all text-base shadow-md">
              <User className="w-5 h-5" /> เข้าสู่ระบบ
            </Link>
            <p className="text-sm text-gray-500 mt-4">หรือ <Link to="/login" className="text-blue-600 underline">สมัครสมาชิกฟรี</Link></p>
          </div>
        </section>
        <section className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            return (
              <Link key={cat.id} to="/products"
                className={`bg-gradient-to-br ${cat.gradient} rounded-xl p-4 border border-transparent hover:shadow-md transition-all`}>
                <Icon className={`w-7 h-7 ${cat.iconColor} mb-2`} />
                <div className="font-medium text-gray-800 text-sm">{cat.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">{cat.count}</div>
              </Link>
            );
          })}
        </section>
      </div>
    );
  }

  // ── Login แล้ว: หน้าแรกแบบ Forte ──
  return (
    <div className="bg-white">
      {/* Hero Slider */}
      <section className="relative overflow-hidden">
        {HERO_SLIDES.map((s, i) => (
          <div key={i} className={`bg-gradient-to-r ${s.bg} transition-opacity duration-700 ${i === slide ? "opacity-100 relative" : "opacity-0 absolute inset-0"}`}>
            <div className="max-w-6xl mx-auto px-6 py-20 md:py-28">
              <div className="max-w-2xl text-white">
                <ShoppingBag className="w-12 h-12 text-white/40 mb-6" />
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">{s.title}</h1>
                <p className="text-lg text-white/70 mb-8">{s.subtitle}</p>
                <Link to="/products" className="inline-flex items-center gap-2 bg-white text-gray-900 font-semibold px-6 py-3 rounded-xl hover:shadow-lg transition-all text-sm">
                  ดูสินค้าทั้งหมด <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        ))}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
          {HERO_SLIDES.map((_, i) => (
            <button key={i} onClick={() => setSlide(i)} className={`w-2 h-2 rounded-full transition-all ${i === slide ? "bg-white w-6" : "bg-white/40"}`} />
          ))}
        </div>
      </section>

      {/* Trust badges */}
      <section className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-gray-500">
          <span className="flex items-center gap-2"><Truck className="w-4 h-4 text-blue-500" /> ค่าส่งตามน้ำหนัก</span>
          <span className="flex items-center gap-2"><CreditCard className="w-4 h-4 text-blue-500" /> สั่ง 500+ ลดค่าส่ง 50%</span>
          <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-blue-500" /> สินค้าของแท้</span>
          <span className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-500" /> ราคายุติธรรม</span>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-6xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">หมวดหมู่สินค้า</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            return (
              <Link key={cat.id} to="/products"
                className={`bg-gradient-to-br ${cat.gradient} rounded-xl p-4 border border-transparent hover:shadow-md transition-all`}>
                <Icon className={`w-7 h-7 ${cat.iconColor} mb-2`} />
                <div className="font-medium text-gray-800 text-sm">{cat.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">{cat.count}</div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Featured Products */}
      {featuredLoading ? (
        <section className="bg-gray-50 border-t border-gray-100 py-12">
          <div className="max-w-6xl mx-auto px-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">สินค้าแนะนำ</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden animate-pulse">
                  <div className="aspect-square bg-gray-100" />
                  <div className="p-3 space-y-2">
                    <div className="h-4 bg-gray-100 rounded w-3/4" />
                    <div className="h-5 bg-gray-100 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : featured.length > 0 && (
        <section className="bg-gray-50 border-t border-gray-100 py-12">
          <div className="max-w-6xl mx-auto px-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">สินค้าแนะนำ</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {featured.map(p => (
                <Link key={p.id} to={`/products/${p.id}`}
                  className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-all">
                  <div className="aspect-square bg-gray-50 flex items-center justify-center p-4">
                    {p.image ? (
                      <img src={p.image} alt={p.nameTh} className="w-full h-full object-contain"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <Package className="w-10 h-10 text-gray-200" />
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-medium text-gray-800 line-clamp-2">{p.nameTh}</h3>
                    <div className="text-base font-bold text-blue-600 mt-1.5">฿{p.price?.toFixed(2)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Recently Viewed Products */}
      {recentlyLoading ? (
        <section className="bg-white border-t border-gray-100 py-12">
          <div className="max-w-6xl mx-auto px-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">👁️ สินค้าที่เพิ่งดู</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden animate-pulse">
                  <div className="aspect-square bg-gray-100" />
                  <div className="p-3 space-y-2">
                    <div className="h-4 bg-gray-100 rounded w-3/4" />
                    <div className="h-5 bg-gray-100 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : recentlyViewed.length > 0 ? (
        <section className="bg-white border-t border-gray-100 py-12">
          <div className="max-w-6xl mx-auto px-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">👁️ สินค้าที่เพิ่งดู</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {recentlyViewed.map(p => (
                <Link key={p.id} to={`/products/${p.id}`}
                  className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-all group">
                  <div className="aspect-square bg-gray-50 flex items-center justify-center p-4">
                    {p.image ? (
                      <img src={p.image} alt={p.nameTh} className="w-full h-full object-contain"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <Package className="w-10 h-10 text-gray-200" />
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-medium text-gray-800 line-clamp-2 group-hover:text-blue-600 transition-colors">{p.nameTh}</h3>
                    <div className="text-base font-bold text-blue-600 mt-1.5">฿{p.price?.toFixed(2)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section className="bg-white border-t border-gray-100 py-12">
          <div className="max-w-6xl mx-auto px-6 text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-2">👁️ สินค้าที่เพิ่งดู</h2>
            <p className="text-sm text-gray-400">ยังไม่มีสินค้าที่เพิ่งดู</p>
          </div>
        </section>
      )}

      {/* CTA */}
      <div className="max-w-lg mx-auto mb-6"><LicenseBadge /></div>
      <footer className="bg-white border-t border-gray-100 text-gray-500 py-10">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
          <div className="col-span-2 md:col-span-1">
            <h3 className="font-bold text-gray-800 mb-2">{s.storeNameTh || "PharmaSIA"}</h3>
            <p className="text-gray-400 leading-relaxed">{s.storeAddress || "ร้านยาออนไลน์"}</p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-700 mb-3">เมนู</h4>
            <ul className="space-y-2">
              <li><Link to="/" className="hover:text-blue-600">หน้าแรก</Link></li>
              <li><Link to="/products" className="hover:text-blue-600">สินค้า</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-700 mb-3">หมวดหมู่</h4>
            <ul className="space-y-2">
              {CATEGORIES.slice(0, 5).map(c => <li key={c.id}><Link to="/products" className="hover:text-blue-600">{c.name}</Link></li>)}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-700 mb-3">ติดต่อ</h4>
            <ul className="space-y-2">
              {s.storePhone && <li className="flex items-center gap-2"><Phone className="w-3 h-3" /> {s.storePhone}</li>}
              {s.storeEmail && <li className="flex items-center gap-2"><Mail className="w-3 h-3" /> {s.storeEmail}</li>}
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-50 mt-8 pt-6 text-center text-xs text-gray-300">&copy; 2026 {s.storeNameTh || "PharmaSIA"}</div>
      </footer>
    </div>
  );
}
