/**
 * src/components/Pagination.tsx
 * Reusable Pagination component — ใช้กับทุกหน้า
 * รองรับ: หน้าปัจจุบัน, จำนวนหน้าทั้งหมด, callback onChange
 */
import React from "react";

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages: (number | string)[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);

  if (start > 1) { pages.push(1); if (start > 2) pages.push("..."); }
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < totalPages) { if (end < totalPages - 1) pages.push("..."); pages.push(totalPages); }

  return (
    <div className="flex items-center justify-center gap-2 mt-8 flex-wrap">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        ← ก่อนหน้า
      </button>

      {pages.map((p, idx) =>
        p === "..." ? (
          <span key={`dot-${idx}`} className="px-1 text-gray-400 select-none text-sm">...</span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p as number)}
            className={`w-10 h-10 rounded-xl text-sm font-medium transition-all ${
              p === page
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-50 border border-gray-200"
            }`}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        ถัดไป →
      </button>
    </div>
  );
}
