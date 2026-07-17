import { useState } from "react";
import { Link } from "react-router-dom";
import type { Product } from "../types";
import { getSessionId } from "../lib/session";
import { apiClient } from "../lib/api";

const LINE_OA_ID = localStorage.getItem("line_oa_id") || "@YOUR_LINE_OA_ID";

// Extract initials from product name for placeholder
function getInitials(name?: string, nameEn?: string): string {
  const src = nameEn || name || "??";
  const words = src.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

// Random stable gradient from product id
function getGradient(id: number): string {
  const gradients = [
    "from-blue-400 to-indigo-500",
    "from-emerald-400 to-teal-500",
    "from-violet-400 to-purple-500",
    "from-amber-400 to-orange-500",
    "from-rose-400 to-pink-500",
    "from-cyan-400 to-sky-500",
    "from-lime-400 to-green-500",
    "from-fuchsia-400 to-pink-500",
  ];
  return gradients[(id ?? 1) % gradients.length];
}

export function ProductCard({ product }: { product: Product }) {
  const [qty, setQty] = useState(1);
  const [imgError, setImgError] = useState(false);

  const stockLevel = (product.stock ?? 0) <= 0 ? "out"
    : (product.stock ?? 0) <= 5 ? "low"
    : "ok";

  const stockBadge = {
    out: { text: "❌ หมด", color: "bg-gray-800/80" },
    low: { text: `⚠️ เหลือ ${product.stock}`, color: "bg-amber-500/90" },
    ok: { text: `🟢 มีของ`, color: "bg-emerald-500/90" },
  }[stockLevel];

  const addToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const d = await apiClient("/api/cart/add", {
        method: "POST",
        body: JSON.stringify({ productId: product.id, quantity: qty, sessionId: getSessionId() }),
      });
      if (d.success) {
        window.dispatchEvent(new CustomEvent("cart-updated"));
        setQty(1);
      } else {
        alert("ไม่สามารถเพิ่มสินค้าได้");
      }
    } catch {
      alert("เกิดข้อผิดพลาด กรุณาลองใหม่");
    }
  };

  return (
    <div className="group bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-xl hover:border-blue-200 hover:-translate-y-1 transition-all duration-300">
      {/* Image Section */}
      <Link to={`/products/${product.id}`} className="block">
        <div className={`aspect-square bg-gradient-to-br flex items-center justify-center relative overflow-hidden ${product.image && !imgError ? '' : 'from-gray-50 to-gray-100'}`}>
          {product.image && !imgError ? (
            <img
              src={product.image}
              alt={product.nameTh}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${getGradient(product.id)} flex items-center justify-center`}>
              <span className="text-4xl font-bold text-white/80 drop-shadow-sm">
                {getInitials(product.nameTh, product.nameEn)}
              </span>
            </div>
          )}

          {/* Stock Badge */}
          <span className={`absolute top-3 left-3 px-2.5 py-1 ${stockBadge.color} text-white text-[11px] font-semibold rounded-lg backdrop-blur-sm shadow-sm`}>
            {stockBadge.text}
          </span>

          {/* Discount Badge */}
          {product.originalPrice && product.originalPrice > 0 && stockLevel !== "out" && (
            <span className="absolute top-3 right-3 px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-md shadow-sm">
              -{Math.round((1 - product.price / product.originalPrice) * 100)}%
            </span>
          )}
        </div>
      </Link>

      {/* Info Section */}
      <div className="p-4 flex flex-col gap-2">
        {/* Category Badge if subCategory */}
        {"subCategoryId" in product && (product as any).subCategoryId && (
          <span className="text-[10px] text-blue-500 font-medium uppercase tracking-wide">
            💊 หมวดย่อย #{(product as any).subCategoryId}
          </span>
        )}

        {/* Product Name */}
        <Link to={`/products/${product.id}`}>
          <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors min-h-[2.5rem]">
            {product.nameTh}
          </h3>
        </Link>

        {/* Price */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold text-orange-600">฿{product.price?.toFixed(2)}</span>
          {product.originalPrice && (
            <span className="text-xs text-gray-400 line-through">฿{product.originalPrice.toFixed(2)}</span>
          )}
        </div>

        {/* SKU (optional, subtle) */}
        {"sku" in product && product.sku && (
          <span className="text-[10px] text-gray-300 truncate">{product.sku}</span>
        )}

        {/* Action Section */}
        {product.requiresPrescription ? (
          <button
            onClick={(e) => {
              e.preventDefault();
              const msg = encodeURIComponent("สวัสดีครับ/ค่ะ ต้องการปรึกษาเภสัชกรเกี่ยวกับตัวยา: " + product.nameTh);
              window.open(`https://line.me/R/oaMessage/${LINE_OA_ID}/?text=${msg}`, "_blank");
            }}
            className="w-full h-10 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 mt-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            ปรึกษาเภสัชกร
          </button>
        ) : stockLevel === "out" ? (
          <div className="h-10 flex items-center justify-center text-sm text-gray-400 font-semibold bg-gray-100 rounded-xl mt-1">
            สินค้าหมดชั่วคราว
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-1">
            {/* Qty Selector */}
            <div className="flex items-center border-2 border-gray-200 rounded-xl overflow-hidden bg-gray-50">
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQty(Math.max(1, qty - 1)); }}
                className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors text-base font-bold"
              >
                −
              </button>
              <span className="w-9 h-9 flex items-center justify-center text-sm font-bold text-gray-900 bg-white border-x-2 border-gray-200">
                {qty}
              </span>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQty(Math.min(qty + 1, product.stock ?? 99)); }}
                className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors text-base font-bold"
              >
                +
              </button>
            </div>
            {/* Add to Cart */}
            <button
              onClick={addToCart}
              className="flex-1 h-9 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-blue-200 hover:shadow-md active:scale-[0.98]"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
              หยิบใส่ตะกร้า
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Keep existing exports unchanged
export function CategoryCard({ name, count, icon, color }: { name: string; count?: number; icon?: string; color?: string }) {
  return (
    <div className="bg-white rounded-2xl p-6 hover:shadow-md transition-all border border-gray-100 cursor-pointer">
      <div className={`w-12 h-12 bg-gradient-to-br ${color || "from-blue-400 to-blue-600"} rounded-xl flex items-center justify-center text-2xl mb-3`}>
        {icon || "📦"}
      </div>
      <h3 className="font-semibold text-gray-900">{name}</h3>
      {count !== undefined && <p className="text-sm text-gray-400">{count} รายการ</p>}
    </div>
  );
}

export function LoadingSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {[...Array(count)].map((_, i) => (
        <div key={i} className="bg-white rounded-2xl overflow-hidden animate-pulse border border-gray-100">
          <div className="aspect-square bg-gray-100" />
          <div className="p-4 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
          </div>
        </div>
      ))}
    </>
  );
}
