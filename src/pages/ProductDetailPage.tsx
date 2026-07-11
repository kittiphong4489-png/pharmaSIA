import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiClient } from "../lib/api";
import { getSessionId } from "../lib/session";
import type { Product } from "../types";

export default function ProductDetailPage() {
  const { id } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [added, setAdded] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [qty, setQty] = useState(1);
  const [relatedProducts, setRelatedProducts] = useState<any[]>([]);
  const [zoomed, setZoomed] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

  const addToCart = async () => {
    if (!product) return;
    setAddingToCart(true);
    try {
      await apiClient("/api/cart/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: getSessionId(), productId: product.id, quantity: qty }) });
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
      const ev = new CustomEvent("cart-updated");
      window.dispatchEvent(ev);
    } catch {
      alert("❌ ไม่สามารถเพิ่มสินค้าลงตะกร้าได้ กรุณาลองอีกครั้ง");
    }
    setAddingToCart(false);
  };

  const consultPharmacist = () => {
    const productName = product?.nameTh || "สินค้า";
    const message = encodeURIComponent("สวัสดีครับ/ค่ะ ต้องการปรึกษาเภสัชกรเกี่ยวกับตัวยา: " + productName);
    const lineUrl = "https://line.me/R/oaMessage/@YOUR_LINE_OA_ID/?text=" + message;
    window.open(lineUrl, "_blank");
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePos({ x, y });
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    setFetchError(false);
    const token = localStorage.getItem("pharma_token");

    apiClient(`/api/products/${id}`).then((data) => {
      if (data.items) {
        const found = data.items.find((p: Product) => String(p.id) === id);
        if (found) setProduct(found);
        else setNotFound(true);
      } else if (data.id) {
        setProduct(data);
      } else {
        setNotFound(true);
      }
      setLoading(false);
    }).catch(() => {
      setFetchError(true);
      setLoading(false);
    });

    setQty(1);
    if (token) apiClient(`/api/products/${id}/viewed`, { method: "POST", headers: { "Authorization": `Bearer ${token}` } }).catch(() => {});
    apiClient(`/api/products/${id}/related?limit=4`).then(d => setRelatedProducts(d.related || [])).catch(() => {});
  }, [id]);

  if (loading) return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="animate-pulse grid md:grid-cols-2 gap-8 lg:gap-16">
        <div className="aspect-square bg-gray-100 rounded-2xl" />
        <div className="space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4" />
          <div className="h-8 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-100 rounded w-1/2" />
          <div className="h-10 bg-gray-200 rounded w-1/3" />
          <div className="h-24 bg-gray-100 rounded" />
        </div>
      </div>
    </div>
  );

  if (fetchError) return (
    <div className="max-w-6xl mx-auto px-4 py-20 text-center">
      <div className="text-5xl mb-4">⚠️</div>
      <h2 className="text-lg font-medium text-gray-900 mb-2">เกิดข้อผิดพลาด</h2>
      <p className="text-sm text-gray-500 mb-4">ไม่สามารถโหลดข้อมูลสินค้าได้ กรุณาลองใหม่อีกครั้ง</p>
      <button onClick={() => window.location.reload()} className="text-blue-600 hover:text-blue-700 text-sm font-medium">ลองอีกครั้ง</button>
    </div>
  );

  if (!product || notFound) return (
    <div className="max-w-6xl mx-auto px-4 py-20 text-center">
      <div className="text-5xl mb-4">🔍</div>
      <h2 className="text-lg font-medium text-gray-900 mb-2">ไม่พบสินค้า</h2>
      <Link to="/products" className="text-blue-600 hover:text-blue-700 text-sm font-medium">← กลับไปหน้ารายการสินค้า</Link>
    </div>
  );

  const keywordTags: { label: string; color: string }[] = [];
  if (product.requiresPrescription) keywordTags.push({ label: "📄 ต้องใช้ใบสั่งยา", color: "bg-red-50 text-red-700 border-red-200" });
  if (product.symptoms) keywordTags.push({ label: `🩺 ${product.symptoms}`, color: "bg-blue-50 text-blue-700 border-blue-200" });
  if (product.genericNameTh) keywordTags.push({ label: `⚗️ ${product.genericNameTh}`, color: "bg-purple-50 text-purple-700 border-purple-200" });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-400 mb-8">
        <Link to="/" className="hover:text-blue-600 transition-colors">หน้าแรก</Link>
        <span>/</span>
        <Link to="/products" className="hover:text-blue-600 transition-colors">สินค้า</Link>
        <span>/</span>
        <span className="text-gray-600 font-medium truncate">{product.nameTh}</span>
      </nav>

      <div className="grid md:grid-cols-2 gap-8 lg:gap-16">
        {/* ── Left: Image with Zoom ── */}
        <div className="sticky top-24 self-start">
          <div
            className="relative bg-white rounded-2xl border border-gray-100 overflow-hidden cursor-crosshair group"
            onMouseEnter={() => setZoomed(true)}
            onMouseLeave={() => setZoomed(false)}
            onMouseMove={handleMouseMove}
          >
            {product.image ? (
              <img
                src={product.image} alt={product.nameTh}
                className="w-full aspect-square object-contain p-8 transition-transform duration-200"
                style={{ transform: zoomed ? "scale(2)" : "scale(1)", transformOrigin: `${mousePos.x}% ${mousePos.y}%` }}
              />
            ) : (
              <div className="aspect-square flex items-center justify-center">
                <div className="text-8xl">💊</div>
              </div>
            )}
            {/* Magnifier hint */}
            {zoomed && product.image && (
              <div className="absolute bottom-3 right-3 bg-white/80 backdrop-blur-sm rounded-lg px-2.5 py-1 text-xs text-gray-500 shadow-sm">
                🔍 ดูรายละเอียด
              </div>
            )}
          </div>
          {/* Share / Save */}
          <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
            <button onClick={() => { navigator.clipboard?.writeText(window.location.href); alert("✅ คัดลอกลิงก์สินค้าแล้ว"); }} className="hover:text-blue-600 transition-colors">🔗 แชร์</button>
          </div>
        </div>

        {/* ── Right: Details ── */}
        <div className="flex flex-col">
          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-4">
            {keywordTags.map((tag, i) => (
              <span key={i} className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${tag.color}`}>
                {tag.label}
              </span>
            ))}
          </div>

          {/* SKU + Barcode */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{product.sku || ""}</span>
            {product.barcode && <span className="text-xs text-gray-400 font-mono">🔲 {product.barcode}</span>}
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{product.nameTh}</h1>
          {product.nameEn && <p className="text-sm text-gray-400 mb-3">{product.nameEn}</p>}

          {/* Price */}
          <div className="flex items-baseline gap-3 mb-6">
            <span className="text-3xl font-bold text-blue-600">฿{Number(product.price).toFixed(2)}</span>
            {product.originalPrice && Number(product.originalPrice) > Number(product.price) && (
              <span className="text-lg text-gray-400 line-through">฿{Number(product.originalPrice).toFixed(2)}</span>
            )}
            <span className="text-sm text-gray-400">/{product.unit}</span>
          </div>

          {/* Description */}
          {product.descriptionTh && (
            <div className="mb-6 p-4 bg-gray-50 rounded-xl">
              <h3 className="font-semibold text-gray-800 mb-2 text-sm">📋 รายละเอียดสินค้า</h3>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{product.descriptionTh}</p>
            </div>
          )}

          {/* Stock Status */}
          <div className="flex items-center gap-4 mb-8 text-sm">
            <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium ${
              (product.stock ?? 0) > 10 ? "bg-green-50 text-green-700" :
              (product.stock ?? 0) > 0 ? "bg-amber-50 text-amber-700" :
              "bg-red-50 text-red-700"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                (product.stock ?? 0) > 10 ? "bg-green-500" :
                (product.stock ?? 0) > 0 ? "bg-amber-500" :
                "bg-red-500"
              }`} />
              {(product.stock ?? 0) > 0 ? `สินค้าพร้อมส่ง (${product.stock} ชิ้น)` : "สินค้าหมดชั่วคราว"}
            </span>
            {product.soldCount ? <span className="text-gray-400">📦 ขายแล้ว {product.soldCount} ชิ้น</span> : null}
          </div>

          {/* Quantity + Add to Cart + Consult */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                <button onClick={() => setQty(Math.max(1, qty-1))}
                  className="px-4 py-3 text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors text-lg font-medium">
                  −
                </button>
                <span className="px-4 py-3 text-gray-900 font-medium min-w-[3rem] text-center">{qty}</span>
                <button onClick={() => setQty(Math.min(qty + 1, product.stock ?? 0))}
                  className="px-4 py-3 text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors text-lg font-medium">
                  +
                </button>
              </div>
              <button onClick={addToCart} disabled={addingToCart || (product.stock ?? 0) <= 0}
                className="flex-1 py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-blue-700 shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {addingToCart ? "⏳ กำลังเพิ่ม..." : added ? "✅ เพิ่มในตะกร้าแล้ว" : (product.stock ?? 0) > 0 ? "🛒 หยิบใส่ตะกร้า" : "หมดชั่วคราว"}
              </button>
            </div>
            {/* Consult Pharmacist Button */}
            <button onClick={consultPharmacist}
              className="w-full py-3 bg-gradient-to-r from-emerald-400 to-emerald-500 text-white font-medium rounded-xl hover:from-emerald-500 hover:to-emerald-600 shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              ปรึกษาเภสัชกร
            </button>
          </div>

          {/* Trust badges */}
          <div className="flex items-center gap-6 text-xs text-gray-400 border-t border-gray-100 pt-6 mt-2">
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              สินค้าแท้ 100%
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              จัดส่งรวดเร็ว
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              ชำระเงินปลอดภัย
            </span>
          </div>
        </div>
      </div>

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <section className="mt-16 pt-10 border-t border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-6">🔄 สินค้าที่เกี่ยวข้อง</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {relatedProducts.map((p: any) => (
              <Link key={p.id} to={`/products/${p.id}`}
                className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-lg hover:border-blue-100 transition-all group">
                <div className="aspect-square bg-gray-50 flex items-center justify-center p-4">
                  {p.image ? (
                    <img src={p.image} alt={p.nameTh} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="text-4xl">💊</div>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-medium text-gray-800 line-clamp-2 group-hover:text-blue-600 transition-colors">{p.nameTh}</h3>
                  {p.genericNameTh && <p className="text-xs text-gray-400 mt-0.5">{p.genericNameTh}</p>}
                  <div className="text-base font-bold text-blue-600 mt-1.5">฿{p.price?.toFixed(2)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
