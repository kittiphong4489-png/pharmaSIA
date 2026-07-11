import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../lib/api";

interface Suggestion {
  id: number; nameTh: string; nameEn: string; price: number; stock: number; sku: string; image?: string;
}

export default function SearchOverlay({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (query.length < 1) { setSuggestions([]); return; }
    const timer = setTimeout(() => {
      apiClient(`/api/products/suggest?q=${encodeURIComponent(query)}`)
        .then(d => setSuggestions(d.suggestions || [])).catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  const search = (q: string) => {
    navigate(`/products?search=${encodeURIComponent(q)}`);
    onClose();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { setSelectedIdx(Math.min(selectedIdx + 1, suggestions.length - 1)); e.preventDefault(); }
    if (e.key === "ArrowUp") { setSelectedIdx(Math.max(selectedIdx - 1, -1)); e.preventDefault(); }
    if (e.key === "Enter") {
      if (selectedIdx >= 0 && suggestions[selectedIdx]) {
        navigate(`/products/${suggestions[selectedIdx].id}`);
      } else {
        search(query);
      }
      onClose();
    }
    if (e.key === "Escape") onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-4 border-b border-gray-100">
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input ref={inputRef} type="text" value={query} onChange={(e) => { setQuery(e.target.value); setSelectedIdx(-1); }}
            onKeyDown={handleKey} placeholder="ค้นหาชื่อสินค้า อาการ ตัวยาสามัญ..." className="flex-1 text-base outline-none bg-transparent" />
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {suggestions.length > 0 && (
          <div className="max-h-80 overflow-y-auto p-2">
            {suggestions.map((s, i) => (
              <button key={s.id} onClick={() => { navigate(`/products/${s.id}`); onClose(); }}
                className={`w-full flex items-center gap-4 p-3 rounded-xl text-left transition-colors ${i === selectedIdx ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                <div className="w-10 h-10 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl flex items-center justify-center text-lg flex-shrink-0 overflow-hidden">
                  {s.image ? <img src={s.image} alt={s.nameTh} className="w-full h-full object-contain" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} /> : "💊"}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{s.nameTh}</p>
                  <p className="text-xs text-gray-400">{s.sku}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-blue-600">฿{s.price}</p>
                  <p className={`text-xs ${s.stock > 0 ? "text-green-600" : "text-red-500"}`}>{s.stock > 0 ? "มีสินค้า" : "หมด"}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {query.length > 0 && suggestions.length === 0 && (
          <div className="p-6 text-center text-gray-400 text-sm">
            {query.length >= 1 ? "🔍 ไม่พบสินค้า" : "พิมพ์เพื่อค้นหา..."}
          </div>
        )}

        {query.length > 0 && (
          <div className="p-3 border-t border-gray-100">
            <button onClick={() => search(query)} className="w-full py-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl text-sm text-gray-600 font-medium transition-colors">
              ค้นหา "{query}" ทั้งหมด
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
