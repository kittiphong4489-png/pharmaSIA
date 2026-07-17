import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../lib/api";

interface Suggestion {
  id: number;
  name: string;
  sku: string;
  price: number;
  stock: number;
  categoryId: number;
}

interface Props {
  onSearch: (query: string) => void;
  initialValue?: string;
}

export default function SearchBar({ onSearch, initialValue = "" }: Props) {
  const [query, setQuery] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  // Sync query with URL param changes (e.g., sidebar clear)
  useEffect(() => { setQuery(initialValue); }, [initialValue]);

  // Debounced suggest fetch
  const fetchSuggestions = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 1) { setSuggestions([]); setIsOpen(false); return; }
    
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiClient(`/api/products/suggest?q=${encodeURIComponent(q)}`);
        setSuggestions(data?.suggestions || []);
        setIsOpen((data?.suggestions || []).length > 0);
      } catch {
        setSuggestions([]);
        setIsOpen(false);
      }
    }, 300);
  }, []);

  useEffect(() => {
    fetchSuggestions(query);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (blurRef.current) clearTimeout(blurRef.current);
    };
  }, [query, fetchSuggestions]);

  const handleSubmit = (q?: string) => {
    const term = q || query;
    setIsOpen(false);
    onSearch(term);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, -1)); }
    else if (e.key === "Enter") { 
      e.preventDefault();
      if (selectedIdx >= 0 && suggestions[selectedIdx]) {
        navigate(`/products/${suggestions[selectedIdx].id}`);
      } else {
        handleSubmit();
      }
    }
    else if (e.key === "Escape") { setIsOpen(false); inputRef.current?.blur(); }
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <div className="flex gap-0 shadow-lg rounded-2xl overflow-hidden border-2 border-blue-500/20 focus-within:border-blue-500 focus-within:shadow-blue-100 transition-all">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedIdx(-1); }}
          onFocus={() => { if (suggestions.length > 0) setIsOpen(true); }}
          onBlur={() => {
            if (blurRef.current) clearTimeout(blurRef.current);
            blurRef.current = setTimeout(() => setIsOpen(false), 200);
          }}
          onKeyDown={handleKeyDown}
          placeholder="🔍 ค้นหายา / สินค้า / SKU..."
          className="flex-1 px-5 py-3.5 text-base bg-white outline-none text-gray-800 placeholder-gray-400"
        />
        <button
          onClick={() => handleSubmit()}
          className="px-6 py-3.5 bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-colors flex items-center gap-1.5"
        >
          <span>🔍</span>
          <span className="hidden sm:inline">ค้นหา</span>
        </button>
      </div>

      {/* Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50 max-h-80 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              onMouseDown={(e) => { e.preventDefault(); navigate(`/products/${s.id}`); }}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-b border-gray-50 last:border-0 ${
                i === selectedIdx ? "bg-blue-50" : "hover:bg-gray-50"
              }`}
            >
              <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg flex items-center justify-center text-lg">
                💊
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">{s.name}</div>
                <div className="text-xs text-gray-400">{s.sku}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-blue-600">฿{s.price?.toFixed(2)}</div>
                <div className={`text-xs ${s.stock > 0 ? "text-green-500" : "text-red-400"}`}>
                  {s.stock > 0 ? `🟢 มีของ` : "❌ หมด"}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
