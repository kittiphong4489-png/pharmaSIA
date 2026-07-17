import { useState } from "react";

interface FilterBarProps {
  filters: { [key: string]: string };
  onFilterChange: (key: string, value: string) => void;
  onClearAll: () => void;
}

export default function FilterBar({ filters, onFilterChange, onClearAll }: FilterBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🔍</span>
          <span className="text-sm font-semibold text-gray-700">ตัวกรองขั้นสูง</span>
          {activeCount > 0 && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onClearAll(); }}
              className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1"
            >
              ล้างทั้งหมด
            </button>
          )}
          <span className={`text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}>▼</span>
        </div>
      </button>

      {/* Body */}
      {isOpen && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-4">
          {/* Price Range */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
              💰 ตามงบประมาณ (฿)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="ขั้นต่ำ"
                value={filters.priceMin || ""}
                onChange={(e) => onFilterChange("priceMin", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              />
              <span className="text-gray-400">—</span>
              <input
                type="number"
                placeholder="สูงสุด"
                value={filters.priceMax || ""}
                onChange={(e) => onFilterChange("priceMax", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
