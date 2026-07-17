import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../lib/api";

interface RecProduct {
  id: number;
  nameTh: string;
  price: number;
  image: string | null;
  soldCount: number;
}

interface Props {
  currentCategoryId?: string;
  excludeIds?: number[];
}

export default function RecommendationStrip({ currentCategoryId, excludeIds = [] }: Props) {
  const [popular, setPopular] = useState<RecProduct[]>([]);
  const [newest, setNewest] = useState<RecProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ sort: "popular", limit: "6" });
    if (currentCategoryId) params.set("categoryId", currentCategoryId);

    Promise.all([
      apiClient(`/api/products?${params}`),
      apiClient(`/api/products?sort=newest&limit=6` + (currentCategoryId ? `&categoryId=${currentCategoryId}` : "")),
    ]).then(([popularData, newestData]) => {
      setPopular((popularData?.items || []).filter((p: any) => !excludeIds.includes(p.id)).slice(0, 6));
      setNewest((newestData?.items || []).filter((p: any) => !excludeIds.includes(p.id)).slice(0, 6));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [currentCategoryId]);

  if (loading) return null;
  if (!popular.length && !newest.length) return null;

  return (
    <div className="space-y-6 mb-8">
      {/* 🔥 Popular */}
      {popular.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <span>🔥</span> สินค้าขายดี
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
            {popular.map((p) => (
              <Link
                key={p.id}
                to={`/products/${p.id}`}
                className="shrink-0 w-36 bg-white rounded-xl border border-gray-100 hover:border-orange-200 hover:shadow-sm transition-all overflow-hidden"
              >
                <div className="h-24 bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center text-3xl">
                  💊
                </div>
                <div className="p-2">
                  <div className="text-xs font-medium text-gray-800 truncate">{p.nameTh}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs font-bold text-orange-600">฿{p.price?.toFixed(0)}</span>
                    <span className="text-[10px] text-gray-400">ขาย {p.soldCount}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 🆕 New */}
      {newest.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <span>🆕</span> มาใหม่
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
            {newest.map((p) => (
              <Link
                key={p.id}
                to={`/products/${p.id}`}
                className="shrink-0 w-36 bg-white rounded-xl border border-gray-100 hover:border-blue-200 hover:shadow-sm transition-all overflow-hidden"
              >
                <div className="h-24 bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center text-3xl">
                  🆕
                </div>
                <div className="p-2">
                  <div className="text-xs font-medium text-gray-800 truncate">{p.nameTh}</div>
                  <div className="mt-1">
                    <span className="text-xs font-bold text-blue-600">฿{p.price?.toFixed(0)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
