interface SubCategory {
  id: number;
  nameTh: string;
  icon: string;
}

interface Props {
  subCategories: SubCategory[];
  selectedSubCategoryId: number | null;
  onSelect: (subCategoryId: number | null) => void;
}

export default function SubCategoryList({ subCategories, selectedSubCategoryId, onSelect }: Props) {
  if (subCategories.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">
        🏷️ หมวดย่อย
      </div>
      <div className="space-y-0.5">
        {/* All sub-categories */}
        <button
          onClick={() => onSelect(null)}
          className={`w-full text-left pl-6 pr-2 py-1.5 rounded-lg text-xs font-medium transition-all
            ${selectedSubCategoryId === null
              ? "bg-green-50 text-green-700"
              : "text-gray-500 hover:bg-gray-50"
            }`}
        >
          🔍 ทั้งหมด
        </button>

        {subCategories.map((sc) => {
          const isSelected = selectedSubCategoryId === sc.id;
          return (
            <button
              key={sc.id}
              onClick={() => onSelect(sc.id)}
              className={`w-full text-left pl-6 pr-2 py-1.5 rounded-lg text-xs font-medium transition-all
                ${isSelected
                  ? "bg-green-50 text-green-700 border-l-2 border-green-500"
                  : "text-gray-500 hover:bg-gray-50"
                }`}
            >
              {sc.icon} {sc.nameTh}
            </button>
          );
        })}
      </div>
    </div>
  );
}
