import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../lib/api";
import { getSessionId } from "../lib/session";

interface PosItem {
  id: number;
  nameTh: string;
  sku: string;
  price: number;
  quantity: number;
  stock: number;
  image?: string;
}

export default function PosPage() {
  const [items, setItems] = useState<PosItem[]>([]);
  const [barcode, setBarcode] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const barcodeBuf = useRef("");

  // Barcode scanner — captures rapid keyboard input
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && barcodeBuf.current.length > 3) {
        const code = barcodeBuf.current.trim();
        barcodeBuf.current = "";
        handleBarcodeScan(code);
        return;
      }
      if (e.key.length === 1) {
        barcodeBuf.current += e.key;
        clearTimeout(timer);
        timer = setTimeout(() => { barcodeBuf.current = ""; }, 100);
      }
    };
    window.addEventListener("keydown", handler);
    return () => { window.removeEventListener("keydown", handler); clearTimeout(timer); };
  }, []);

  const handleBarcodeScan = async (code: string) => {
    const data = await apiClient(`/api/products/suggest?q=${encodeURIComponent(code)}`);
    const found = data.suggestions?.[0];
    if (found) {
      addItem(found);
      setMsg(`📦 ${found.nameTh}`);
      setTimeout(() => setMsg(""), 2000);
    } else {
      setMsg(`❌ ไม่พบสินค้าบาร์โค้ด: ${code}`);
      setTimeout(() => setMsg(""), 3000);
    }
  };

  const addItem = (p: any) => {
    setItems(prev => {
      const existing = prev.find(i => i.id === p.id);
      if (existing) {
        if (existing.quantity >= (p.stock || 99)) return prev;
        return prev.map(i => i.id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { id: p.id, nameTh: p.nameTh || p.name, sku: p.sku, price: p.price || 0, quantity: 1, stock: p.stock || 0, image: p.image }];
    });
  };

  useEffect(() => {
    const st = items.reduce((s, i) => s + i.price * i.quantity, 0);
    setTotal(st);
  }, [items]);

  useEffect(() => {
    if (searchQuery.length < 1) { setSuggestions([]); return; }
    const timer = setTimeout(() => {
      apiClient(`/api/products/suggest?q=${encodeURIComponent(searchQuery)}`)
        .then(d => setSuggestions(d.suggestions || [])).catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const updateQty = (id: number, qty: number) => {
    if (qty <= 0) { setItems(prev => prev.filter(i => i.id !== id)); return; }
    setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: qty } : i));
  };

  const placeOrder = async (paymentMethod: "cash" | "transfer") => {
    if (items.length === 0) return;
    setProcessing(true);
    try {
      const orderData = await apiClient("/api/pos/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: getSessionId(),
          items: items.map(i => ({ productId: i.id, quantity: i.quantity, price: i.price })),
          paymentMethod,
          total,
        }),
      });
      if (orderData.success) {
        setItems([]);
        setBarcode("");
        setSearchQuery("");
        setSuggestions([]);
        setMsg(`✅ ออเดอร์ #${orderData.orderId} — ${paymentMethod === "cash" ? "ชำระเงินสด" : "โอนเงิน"} สำเร็จ`);
        setTimeout(() => setMsg(""), 4000);
      } else {
        alert("❌ " + (orderData.error || "Error"));
      }
    } catch (e: any) {
      alert("❌ " + (e?.message || "Error"));
    }
    setProcessing(false);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/seller" className="text-sm text-gray-400 hover:text-blue-600 transition-colors">← กลับ</Link>
          <h1 className="font-bold text-gray-800">🧾 POS หน้าร้าน</h1>
        </div>
        {msg && (
          <div className="text-sm font-medium text-green-600 bg-green-50 px-3 py-1.5 rounded-lg animate-pulse">
            {msg}
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* ── Left: Cart Items ── */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-100">
          {/* Scan / Search */}
          <div className="p-3 bg-white border-b border-gray-100 flex gap-2">
            <input ref={searchRef} type="text" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="🔍 ค้นหาสินค้า หรือสแกนบาร์โค้ด..." className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="text" value={barcode} onChange={e => setBarcode(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && barcode) { handleBarcodeScan(barcode); setBarcode(""); } }}
              placeholder="📷 บาร์โค้ด" className="w-28 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Suggestions dropdown */}
          {suggestions.length > 0 && (
            <div className="bg-white border-b border-gray-100 shadow-sm z-10">
              {suggestions.map((s: any) => (
                <button key={s.id} onClick={() => { addItem(s); setSearchQuery(""); setSuggestions([]); searchRef.current?.focus(); }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-blue-50 text-left text-sm border-b border-gray-50 last:border-0 transition-colors">
                  <span className="text-lg">{s.image ? "📦" : "💊"}</span>
                  <span className="flex-1 font-medium">{s.nameTh}</span>
                  <span className="text-blue-600 font-bold">฿{s.price}</span>
                  <span className="text-xs text-gray-400">stock: {s.stock}</span>
                </button>
              ))}
            </div>
          )}

          {/* Items list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {items.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-5xl mb-3">🧾</div>
                <p className="text-sm">สแกนบาร์โค้ดหรือค้นหาสินค้า</p>
                <p className="text-xs mt-1">สินค้าที่เลือกจะปรากฏที่นี่</p>
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3 shadow-sm">
                  <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center text-lg shrink-0">💊</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.nameTh}</p>
                    <p className="text-xs text-gray-400">{item.sku}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(item.id, item.quantity - 1)} className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-sm hover:bg-gray-50">−</button>
                    <span className="w-8 text-center font-semibold">{item.quantity}</span>
                    <button onClick={() => updateQty(item.id, item.quantity + 1)} disabled={item.quantity >= item.stock} className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-sm hover:bg-gray-50 disabled:opacity-30">+</button>
                  </div>
                  <div className="text-right w-24">
                    <p className="font-bold text-sm">฿{(item.price * item.quantity).toFixed(2)}</p>
                    <p className="text-xs text-gray-400">@ ฿{item.price}</p>
                  </div>
                  <button onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))} className="text-gray-300 hover:text-red-500 text-xs p-1">✕</button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Right: Total + Payment ── */}
        <div className="w-80 bg-white flex flex-col shrink-0">
          <div className="flex-1 p-4 flex flex-col justify-center">
            <p className="text-xs text-gray-400 mb-2 text-center uppercase tracking-wider">ยอดรวม</p>
            <p className="text-4xl font-bold text-center text-blue-600">฿{total.toFixed(2)}</p>
            <p className="text-center text-xs text-gray-400 mt-1">{items.length} รายการ</p>

            <div className="mt-8 space-y-3">
              <button onClick={() => placeOrder("cash")} disabled={items.length === 0 || processing}
                className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold text-lg rounded-xl hover:from-green-600 hover:to-emerald-600 shadow-sm hover:shadow-md transition-all disabled:opacity-40">
                {processing ? "⏳..." : "💵 ชำระเงินสด"}
              </button>
              <button onClick={() => placeOrder("transfer")} disabled={items.length === 0 || processing}
                className="w-full py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold text-lg rounded-xl hover:from-blue-600 hover:to-blue-700 shadow-sm hover:shadow-md transition-all disabled:opacity-40">
                {processing ? "⏳..." : "🏦 โอนเงิน / QR"}
              </button>
            </div>
          </div>

          {/* Quick sum numpad */}
          <div className="border-t border-gray-100 p-3">
            <p className="text-[10px] text-gray-400 text-center">💡 สแกนบาร์โค้ดเพื่อเพิ่มสินค้าอัตโนมัติ</p>
          </div>
        </div>
      </div>
    </div>
  );
}
