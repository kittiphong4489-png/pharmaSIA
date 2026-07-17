import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ProductCard, LoadingSkeleton } from "../components/ProductCard";
import ProductSidebar from "../components/ProductSidebar";
import SearchBar from "../components/SearchBar";
import ProductTable from "../components/ProductTable";
import FilterBar from "../components/FilterBar";
import RecommendationStrip from "../components/RecommendationStrip";
import { apiClient } from "../lib/api";
import type { Product, Category } from "../types";
import Pagination from "../components/Pagination";

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
  const { user } = useAuth();
  const isSeller = user?.role === "seller" || user?.role === "admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "table">(
    (localStorage.getItem("pharma_viewMode") as "grid" | "table") || "grid"
  );
  // Force grid for non-sellers
  useEffect(() => { if (!isSeller && viewMode === "table") setViewMode("grid"); }, [isSeller, viewMode]);
  const [loading, setLoading] = useState(true);

  const catFilter = searchParams.get("categoryId") || "";
  const subFilter = searchParams.get("subCategoryId") || "";
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const sort = searchParams.get("sort") || "default";
  const limit = parseInt(searchParams.get("limit") || "20");

  // Filter params
  const priceMin = searchParams.get("priceMin") || "";
  const priceMax = searchParams.get("priceMax") || "";

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), page: String(page) });
    if (catFilter) params.set("categoryId", catFilter);
    if (subFilter) params.set("subCategoryId", subFilter);
    if (search) params.set("search", search);
    if (sort && sort !== "default") params.set("sort", sort);
    if (priceMin) params.set("minPrice", priceMin);
    if (priceMax) params.set("maxPrice", priceMax);
    Promise.all([
      apiClient(`/api/${viewMode === "table" ? "admin/" : ""}products?${params}`, { headers: { "Authorization": `Bearer ${localStorage.getItem("pharma_token")}` } }),
      apiClient("/api/categories"),
    ]).then(([data, cats]) => {
      setProducts(data.items || []);
      setTotal(data.total || 0);
      setCategories(cats || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [catFilter, subFilter, search, page, sort, limit, priceMin, priceMax, viewMode]);

  const updateFilter = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams);
    if (value) p.set(key, value); else p.delete(key);
    if (key !== "page") p.set("page", "1");
    setSearchParams(p);
  };

  const updateFilters = (...updates: [string, string][]) => {
    const p = new URLSearchParams(searchParams);
    for (const [key, value] of updates) {
      if (value) p.set(key, value); else p.delete(key);
    }
    p.set("page", "1");
    setSearchParams(p);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <ProductSidebar
        categories={categories}
        selectedCategoryId={catFilter ? parseInt(catFilter) : null}
        selectedSubCategoryId={subFilter ? parseInt(subFilter) : null}
        onCategorySelect={(id) => updateFilters(
          ["categoryId", id ? String(id) : ""],
          ["subCategoryId", ""]
        )}
        onSubCategorySelect={(id) => updateFilter("subCategoryId", id ? String(id) : "")}
      />

      {/* Main Content */}
      <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">สินค้าทั้งหมด</h1>
          <p className="text-sm text-gray-500 mt-1">พบ {total} รายการ</p>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <SearchBar onSearch={(q) => updateFilter("search", q)} initialValue={search} />
        </div>

        {/* Filter Bar */}
        <FilterBar
          filters={{ priceMin, priceMax }}
          onFilterChange={updateFilter}
          onClearAll={() => {
            const p = new URLSearchParams(searchParams);
            ["priceMin","priceMax"].forEach(k => p.delete(k));
            p.set("page", "1");
            setSearchParams(p);
          }}
        />

      {/* Filters (sort + pagination) */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
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

      {/* View Toggle — only for sellers */}
      {isSeller && (
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-gray-400">มุมมอง:</span>
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          <button
            onClick={() => { setViewMode("grid"); localStorage.setItem("pharma_viewMode", "grid"); }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              viewMode === "grid" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >👤 บุคคล</button>
          <button
            onClick={() => { setViewMode("table"); localStorage.setItem("pharma_viewMode", "table"); }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              viewMode === "table" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >🏪 ร้านค้า</button>
        </div>
      </div>
      )}

      {/* Recommendation Strip — page 1 only */}
      {page === 1 && !search && viewMode === "grid" && (
        <RecommendationStrip 
          currentCategoryId={catFilter || undefined}
          excludeIds={products.map(p => p.id)}
        />
      )}

      {/* Product Grid / Table */}
      {viewMode === "table" ? (
        <>
          <ProductTable products={products} loading={loading} />
          <div className="mt-4">
            <Pagination page={page} totalPages={totalPages} onChange={(p) => updateFilter("page", String(p))} />
          </div>
        </>
      ) : loading ? (
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
          <Pagination page={page} totalPages={totalPages} onChange={(p) => updateFilter("page", String(p))} />
        </>
      )}
    </div>
    </div>
  );
}