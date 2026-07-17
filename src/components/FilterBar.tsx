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
          {/* Row 1: Price Range + Package Size */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Budget Filter */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                💰 ตามงบประมาณ
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

            {/* Package Size */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                📦 ขนาด/บรรจุภัณฑ์
              </label>
              <select
                value={filters.package || ""}
                onChange={(e) => onFilterChange("package", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 bg-white"
              >
                <option value="">ทั้งหมด</option>
                <option value="แผง">แผง (Blister)</option>
                <option value="กล่อง">กล่อง (Box)</option>
                <option value="ขวด">ขวด (Bottle)</option>
                <option value="ซอง">ซอง (Sachet)</option>
                <option value="กระปุก">กระปุก (Jar)</option>
                <option value="หลอด">หลอด (Tube)</option>
              </select>
            </div>
          </div>

          {/* Row 2: Eligibility + Stock */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Eligibility */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                🏥 ตามสิทธิ์
              </label>
              <div className="flex gap-2">
                {["all", "eligible", "cash"].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => onFilterChange("eligibility", filters.eligibility === opt ? "" : opt)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                      filters.eligibility === opt
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                    }`}
                  >
                    {opt === "all" ? "ทั้งหมด" : opt === "eligible" ? "🏥 เบิกได้" : "💵 ซื้อเอง"}
                  </button>
                ))}
              </div>
            </div>

            {/* Stock Status */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                📦 สถานะสต็อก
              </label>
              <div className="flex gap-2">
                {["all", "inStock", "lowStock"].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => onFilterChange("stockStatus", filters.stockStatus === opt ? "" : opt)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                      filters.stockStatus === opt
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300"
                    }`}
                  >
                    {opt === "all" ? "ทั้งหมด" : opt === "inStock" ? "🟢 มีของ" : "⚠️ เหลือน้อย"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
