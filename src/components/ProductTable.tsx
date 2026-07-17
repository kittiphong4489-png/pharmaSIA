import { useState } from "react";
import { Link } from "react-router-dom";
import type { Product } from "../types";
import { getSessionId } from "../lib/session";
import { apiClient } from "../lib/api";

interface Props {
  products: Product[];
  loading: boolean;
}

export default function ProductTable({ products, loading }: Props) {
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [alerts, setAlerts] = useState<Record<number, string>>({});

  const setQty = (id: number, qty: number) => {
    setQuantities(prev => ({ ...prev, [id]: Math.max(0, qty) }));
  };

  const addToCart = async (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    const qty = quantities[product.id] || 1;
    try {
      const d = await apiClient("/api/cart/add", {
        method: "POST",
        body: JSON.stringify({ productId: product.id, quantity: qty, sessionId: getSessionId() }),
      });
      if (d.success) {
        setAlerts(prev => ({ ...prev, [product.id]: "✅ เพิ่มแล้ว" }));
        setQuantities(prev => ({ ...prev, [product.id]: 0 }));
        window.dispatchEvent(new CustomEvent("cart-updated"));
        setTimeout(() => setAlerts(prev => ({ ...prev, [product.id]: "" })), 1500);
      } else {
        setAlerts(prev => ({ ...prev, [product.id]: "❌ ล้มเหลว" }));
      }
    } catch {
      setAlerts(prev => ({ ...prev, [product.id]: "❌ ผิดพลาด" }));
    }
  };

  const stockBadge = (stock: number | null | undefined) => {
    if (stock === null || stock === undefined) return <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full font-medium">ไม่ระบุ</span>;
    if (stock <= 0) return <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">❌ หมด</span>;
    if (stock <= 5) return <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">⚠️ {stock}</span>;
    return <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full font-medium">🟢 {stock}</span>;
  };

  const profitRate = (price: number, cost: number) => {
    if (!cost || cost <= 0) return "—";
    const pct = ((price - cost) / cost * 100).toFixed(0);
    return `${pct}%`;
  };

  const profitValue = (price: number, cost: number) => {
    if (!cost || cost <= 0) return "—";
    const diff = price - cost;
    const sign = diff >= 0 ? "" : "-";
    return `${sign}฿${Math.abs(diff).toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border overflow-hidden animate-pulse">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="h-14 border-b border-gray-50 last:border-0 bg-gray-50/30" />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-12 text-center">
        <div className="text-4xl mb-3">📦</div>
        <p className="text-gray-500 font-medium">ไม่พบสินค้า</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
      {/* Desktop Table Header */}
      <div className="hidden md:grid grid-cols-[1fr_80px_80px_80px_80px_80px_100px] gap-2 px-4 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wider">
        <div>สินค้า / SKU</div>
        <div className="text-right">ขาย</div>
        <div className="text-right">ต้นทุน</div>
        <div className="text-right">กำไร฿</div>
        <div className="text-right">กำไร%</div>
        <div className="text-center">สต็อก</div>
        <div className="text-center">หยิบ</div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-gray-100">
        {products.map((p) => (
          <div key={p.id}>
            <div
              onClick={() => setExpanded(expanded === p.id ? null : p.id)}
              className="grid grid-cols-1 md:grid-cols-[1fr_80px_80px_80px_80px_80px_100px] gap-2 px-4 py-3 items-center hover:bg-blue-50/30 transition-colors cursor-pointer"
            >
              {/* Product Info */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg flex items-center justify-center text-sm font-bold text-blue-600 shrink-0">
                  {p.sku?.slice(0, 3) || "??"}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{p.nameTh}</div>
                  <div className="text-xs text-gray-400">{p.sku}</div>
                </div>
                <span className={`text-xs transition-transform ${expanded === p.id ? "rotate-90" : ""}`}>▶</span>
              </div>

              {/* Price */}
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900">฿{p.price?.toFixed(2)}</div>
              </div>

              {/* Cost */}
              <div className="text-right">
                <div className="text-sm text-gray-500">฿{p.costPrice?.toFixed(2) || "—"}</div>
              </div>

              {/* Profit Value */}
              <div className="text-right">
                <div className={`text-sm font-medium ${(p.price - p.costPrice) >= 0 ? "text-emerald-600" : "text-red-500"}`}>{profitValue(p.price, p.costPrice)}</div>
              </div>

              {/* Profit % */}
              <div className="text-right">
                <div className={`text-sm font-medium ${(p.price - p.costPrice) >= 0 ? "text-emerald-600" : "text-red-500"}`}>{profitRate(p.price, p.costPrice)}</div>
              </div>

              {/* Stock */}
              <div className="flex justify-center">{stockBadge(p.stock)}</div>

              {/* Add to Cart */}
              <div className="flex items-center gap-2 justify-center" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={(e) => { e.stopPropagation(); setQty(p.id, (quantities[p.id] || 0) - 1); }}
                  className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold text-gray-600 transition-colors"
                  disabled={(quantities[p.id] || 0) <= 0}
                >−</button>
                <input
                  type="number"
                  value={quantities[p.id] || 0}
                  onChange={(e) => setQty(p.id, parseInt(e.target.value) || 0)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-10 h-7 text-center text-sm font-medium border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  min="0"
                  max={p.stock || 999}
                />
                <button
                  onClick={(e) => { e.stopPropagation(); setQty(p.id, Math.min((quantities[p.id] || 0) + 1, p.stock || 999)); }}
                  className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold text-gray-600 transition-colors"
                  disabled={(quantities[p.id] || 0) >= (p.stock || 0)}
                >+</button>
                <button
                  onClick={(e) => addToCart(p, e)}
                  disabled={!p.stock || p.stock <= 0 || !(quantities[p.id] || 0)}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  {alerts[p.id] || "🛒"}
                </button>
              </div>
            </div>

            {/* Expanded Detail */}
            {expanded === p.id && (
              <div className="px-4 pb-4 bg-blue-50/20 border-t border-blue-100">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 text-sm">
                  <div>
                    <span className="text-xs text-gray-400">ชื่ออังกฤษ</span>
                    <p className="text-gray-700">{p.nameEn || "—"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">หน่วย</span>
                    <p className="text-gray-700">{p.unit || "—"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">หมวดหมู่</span>
                    <Link to={`/products?categoryId=${p.categoryId}`} className="text-blue-600 hover:underline block">
                      ID: {p.categoryId}
                    </Link>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">หมวดย่อย</span>
                    <p className="text-gray-700">{(p as any).subCategoryId || "—"}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Link to={`/products/${p.id}`} className="text-xs text-blue-600 hover:underline">🔍 ดูรายละเอียด</Link>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
