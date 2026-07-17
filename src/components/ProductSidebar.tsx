import { useEffect, useState } from "react";
import CategoryTree, { type Category } from "./CategoryTree";
import SubCategoryList from "./SubCategoryList";
import { apiClient } from "../lib/api";

interface Props {
  categories: Category[];
  selectedCategoryId: number | null;
  selectedSubCategoryId: number | null;
  onCategorySelect: (categoryId: number | null) => void;
  onSubCategorySelect: (subCategoryId: number | null) => void;
}

export default function ProductSidebar({
  categories,
  selectedCategoryId,
  selectedSubCategoryId,
  onCategorySelect,
  onSubCategorySelect,
}: Props) {
  const [subCategories, setSubCategories] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsOpen(false); };
    if (isOpen) { document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey); }
  }, [isOpen]);

  // Load sub-categories when category changes
  useEffect(() => {
    if (selectedCategoryId) {
      apiClient(`/api/sub-categories?categoryId=${selectedCategoryId}`)
        .then((data) => setSubCategories(data || []))
        .catch(() => setSubCategories([]));
    } else {
      setSubCategories([]);
    }
  }, [selectedCategoryId]);

  const SidebarContent = () => (
    <div className="space-y-4">
      <CategoryTree
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        onSelect={(id) => {
          onCategorySelect(id);
          onSubCategorySelect(null);
          setIsOpen(false); // close on mobile
        }}
      />
      <SubCategoryList
        subCategories={subCategories}
        selectedSubCategoryId={selectedSubCategoryId}
        onSelect={(id) => {
          onSubCategorySelect(id);
          setIsOpen(false); // close on mobile
        }}
      />
    </div>
  );

  return (
    <>
      {/* Mobile: Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed bottom-4 left-4 z-50 w-12 h-12 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center text-xl"
        aria-label="เปิดเมนูหมวดหมู่"
      >
        {isOpen ? "✕" : "📂"}
      </button>

      {/* Mobile: Drawer Overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/30 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile: Drawer */}
      <div
        className={`fixed lg:sticky lg:top-20 top-0 left-0 z-40 lg:z-0 h-full lg:h-[calc(100vh-6rem)] w-64 bg-white border-r border-gray-200 overflow-y-auto transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } p-4`}
      >
        <div className="lg:hidden flex items-center justify-between mb-4">
          <span className="font-semibold text-gray-700">หมวดหมู่สินค้า</span>
          <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        <SidebarContent />
      </div>
    </>
  );
}
