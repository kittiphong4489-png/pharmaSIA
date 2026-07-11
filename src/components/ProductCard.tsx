import { useState } from "react";
import { Link } from "react-router-dom";
import type { Product } from "../types";
import { getSessionId } from "../lib/session";
import { apiClient } from "../lib/api";

const LINE_OA_ID = "@YOUR_LINE_OA_ID";

export function ProductCard({ product }: { product: Product }) {
  const [qty, setQty] = useState(1);

  const handleConsultPharmacist = (productName: string) => {
    const message = encodeURIComponent("สวัสดีครับ/ค่ะ ต้องการปรึกษาเภสัชกรเกี่ยวกับตัวยา: " + productName);
    const lineUrl = "https://line.me/R/oaMessage/" + LINE_OA_ID + "/?text=" + message;
    window.open(lineUrl, "_blank");
  };

  const addToCart = async () => {
    const d = await apiClient("/api/cart/add", {
      method: "POST",
      body: JSON.stringify({ productId: product.id, quantity: qty, sessionId: getSessionId() }),
    });
    if (d.success) {
      const ev = new CustomEvent("cart-updated");
      window.dispatchEvent(ev);
      setQty(1);
    } else {
      alert("ไม่สามารถเพิ่มสินค้าได้");
    }
  };

  return (
    <div className="group bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-lg hover:border-blue-100 transition-all duration-200">
      <Link to={`/products/${product.id}`}>
        <div className="aspect-square bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center relative overflow-hidden">
          {product.image ? (
            <img 
              src={product.image} 
              alt={product.nameTh}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
              onError={(e) => { 
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).parentElement!.querySelector('.fallback-icon')?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className={`text-5xl transition-transform duration-300 fallback-icon ${product.image ? 'hidden' : ''}`}>💊</div>
          {(product.stock ?? 0) <= 0 && (
            <span className="absolute top-3 left-3 px-3 py-1 bg-gray-800/80 text-white text-xs font-bold rounded-md backdrop-blur-sm">
              หมด
            </span>
          )}
          {product.originalPrice && (product.stock ?? 0) > 0 && (
            <span className="absolute top-3 right-3 px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-md">
              -{Math.round((1 - product.price / product.originalPrice) * 100)}%
            </span>
          )}
        </div>
      </Link>
      <div className="p-4">
        <Link to={`/products/${product.id}`}>
          <h3 className="font-medium text-gray-900 text-sm leading-snug line-clamp-2 mb-2 group-hover:text-blue-600 transition-colors">
            {product.nameTh}
          </h3>
        </Link>
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="text-base font-bold text-blue-600">฿{product.price}</span>
            {product.originalPrice && (
              <span className="text-xs text-gray-400 line-through ml-1">฿{product.originalPrice}</span>
            )}
          </div>
        </div>
        {product.requiresPrescription ? (
          <button onClick={(e) => { e.preventDefault(); handleConsultPharmacist(product.nameTh); }}
            className="w-full h-8 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors mb-2 flex items-center justify-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            ปรึกษาเภสัชกร
          </button>
        ) : null}
        {/* Quantity Selector + Add to Cart */}
        {(product.stock ?? 0) <= 0 ? (
          <div className="h-8 flex items-center justify-center text-sm text-gray-400 font-medium bg-gray-50 rounded-lg">
            สินค้าหมด
          </div>
        ) : (
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={(e) => { e.preventDefault(); setQty(Math.max(1, qty - 1)); }}
              className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors text-sm font-medium">
              −
            </button>
            <span className="w-8 h-8 flex items-center justify-center text-sm font-medium text-gray-900 border-x border-gray-200">
              {qty}
            </span>
            <button onClick={(e) => { e.preventDefault(); setQty(Math.min(qty + 1, product.stock ?? 0)); }}
              className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors text-sm font-medium">
              +
            </button>
          </div>
          <button onClick={addToCart}
            className="flex-1 h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
            หยิบใส่ตะกร้า
          </button>
        </div>
        )}
      </div>
    </div>
  );
}

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
