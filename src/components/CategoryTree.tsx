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
      {categories.map((cat) => {
        const isSelected = selectedCategoryId === cat.id;

        return (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2
              ${isSelected
                ? "bg-blue-50 text-blue-700 border-l-2 border-blue-600"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
          >
            <span className="text-base">{cat.icon || "📂"}</span>
            <span className="flex-1 truncate">{cat.nameTh}</span>
            <span className="text-xs text-gray-400">{cat.productCount}</span>
          </button>
        );
      })}
    </div>
  );
}
