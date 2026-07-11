import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ProductCard, LoadingSkeleton } from "../components/ProductCard";
import { apiClient } from "../lib/api";
import type { Product, Category } from "../types";

const SORT_OPTIONS = [
  { value: "default", label: "ค่าเริ่มต้น" },
  { value: "price_asc", label: "ราคาต่ำ→สูง" },
  { value: "price_desc", label: "ราคาสูง→ต่ำ" },
  { value: "newest", label: "มาใหม่" },
  { value: "popular", label: "ขายดี" },
  { value: "name", label: "ชื่อ A-Z" },
];

const PAGE_SIZES = [20, 50, 100];

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const catFilter = searchParams.get("categoryId") || "";
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const sort = searchParams.get("sort") || "default";
  const limit = parseInt(searchParams.get("limit") || "20");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), page: String(page) });
    if (catFilter) params.set("categoryId", catFilter);
    if (search) params.set("search", search);
    if (sort && sort !== "default") params.set("sort", sort);
    Promise.all([
      apiClient(`/api/products?${params}`, { headers: { "Authorization": `Bearer ${localStorage.getItem("pharma_token")}` } }),
      apiClient("/api/categories"),
    ]).then(([data, cats]) => {
      setProducts(data.items || []);
      setTotal(data.total || 0);
      setCategories(cats || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [catFilter, search, page, sort, limit]);

  const updateFilter = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams);
    if (value) p.set(key, value); else p.delete(key);
    if (key !== "page") p.set("page", "1");
    setSearchParams(p);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">สินค้าทั้งหมด</h1>
        <p className="text-sm text-gray-500 mt-1">พบ {total} รายการ</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={search} onChange={(e) => updateFilter("search", e.target.value)}
            placeholder="ค้นหาสินค้า..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        {/* Sort dropdown */}
        <select value={sort} onChange={(e) => updateFilter("sort", e.target.value)}
          className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {/* Page size selector */}
        <select value={String(limit)} onChange={(e) => updateFilter("limit", e.target.value)}
          className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          {PAGE_SIZES.map((size) => (
            <option key={size} value={String(size)}>แสดง {size}</option>
          ))}
        </select>
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button onClick={() => updateFilter("categoryId", "")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${!catFilter ? "bg-blue-600 text-white shadow-sm" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
          ทั้งหมด {total > 0 && <span className="ml-1 text-xs opacity-70">({total})</span>}
        </button>
        {categories.filter(c => (c as any).productCount > 0).map((c) => (
          <button key={c.id} onClick={() => updateFilter("categoryId", String(c.id))}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${catFilter === String(c.id) ? "bg-blue-600 text-white shadow-sm" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {c.nameTh} <span className="ml-1 text-xs opacity-70">({c.productCount})</span>
          </button>
        ))}
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          <LoadingSkeleton count={8} />
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🔍</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">ไม่พบสินค้า</h3>
          <p className="text-sm text-gray-500">ลองเปลี่ยนคำค้นหาหรือหมวดหมู่</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10 flex-wrap">
              <button disabled={page <= 1} onClick={() => updateFilter("page", String(page - 1))}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
                ← ก่อนหน้า
              </button>
              {(() => {
                const pages: (number | string)[] = [];
                const start = Math.max(1, page - 2);
                const end = Math.min(totalPages, start + 4);
                if (start > 1) { pages.push(1); pages.push('...'); }
                for (let p = start; p <= end; p++) pages.push(p);
                if (end < totalPages) { pages.push('...'); pages.push(totalPages); }
                return pages.map((p, idx) =>
                  p === '...' ? (
                    <span key={`dot-${idx}`} className="px-1 text-gray-400 select-none">...</span>
                  ) : (
                    <button key={p} onClick={() => updateFilter("page", String(p))}
                      className={`w-10 h-10 rounded-xl text-sm font-medium transition-all ${
                        p === page ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-50 border border-gray-200"
                      }`}>
                      {p}
                    </button>
                  )
                );
              })()}
              <button disabled={page >= totalPages} onClick={() => updateFilter("page", String(page + 1))}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
                ถัดไป →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}