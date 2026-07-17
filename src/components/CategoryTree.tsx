import { useState } from "react";

export interface Category {
  id: number;
  nameTh: string;
  icon: string;
  productCount: number;
}

interface Props {
  categories: Category[];
  selectedCategoryId: number | null;
  onSelect: (categoryId: number | null) => void;
}

export default function CategoryTree({ categories, selectedCategoryId, onSelect }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set([selectedCategoryId || 0]));

  const toggle = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-0.5">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">
        📂 หมวดหมู่
      </div>

      {/* All Products */}
      <button
        onClick={() => onSelect(null)}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2
          ${selectedCategoryId === null
            ? "bg-blue-50 text-blue-700 border-l-2 border-blue-600"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          }`}
      >
        <span className="text-base">📦</span>
        <span className="flex-1">สินค้าทั้งหมด</span>
        <span className="text-xs text-gray-400">
          {categories.reduce((s, c) => s + c.productCount, 0)}
        </span>
      </button>

      {/* Categories */}
      {categories.filter(c => c.productCount > 0 || c.id === selectedCategoryId).map((cat) => {
        const isSelected = selectedCategoryId === cat.id;
        const isExpanded = expanded.has(cat.id);
        const hasSubs = false; // Sub-categories handled by SubCategoryList

        return (
          <button
            key={cat.id}
            onClick={() => {
              onSelect(cat.id);
              toggle(cat.id);
            }}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2
              ${isSelected
                ? "bg-blue-50 text-blue-700 border-l-2 border-blue-600"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
          >
            <span className="text-base">{cat.icon || "📂"}</span>
            <span className="flex-1 truncate">{cat.nameTh}</span>
            <span className="text-xs text-gray-400">{cat.productCount}</span>
            {hasSubs && (
              <span className={`text-xs transition-transform ${isExpanded ? "rotate-90" : ""}`}>
                ▶
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
