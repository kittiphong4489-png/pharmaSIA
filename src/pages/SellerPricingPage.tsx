import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";

interface UnitPriceInfo {
  price?: number;
  costPrice?: number;
  marginPercent?: number;
}

interface ProductPrice {
  id: number; sku: string; nameTh: string; nameEn: string;
  price: number; costPrice: number; marginPercent: number; marginType: string; barcode: string;
  profit: number; unit: string; unitPricing: Record<string, UnitPriceInfo>;
}

interface Category {
  categoryId: number; categoryName: string; count: number; hasCost: number; products: ProductPrice[];
}

// Available units for multi-unit pricing
const ALL_UNITS = [
  { key: "piece", label: "ซอง/ชิ้น" },
  { key: "pack", label: "ห่อ (10 ชิ้น)" },
  { key: "box", label: "กล่อง (100 ชิ้น)" },
  { key: "case", label: "ลัง (500 ชิ้น)" },
];

const UNIT_LABELS: Record<string, string> = {
  piece: "ซอง/ชิ้น",
  pack: "ห่อ",
  box: "กล่อง",
  case: "ลัง",
};

export default function SellerPricingPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCat, setExpandedCat] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    price: 0, marginPercent: 0, costPrice: 0, barcode: "",
    marginType: "percent" as "percent" | "fixed",
    unitPricing: {} as Record<string, UnitPriceInfo>,
  });
  const [bulkMode, setBulkMode] = useState<"all" | number | null>(null);
  const [bulkPercent, setBulkPercent] = useState(15);
  const [bulkPrice, setBulkPrice] = useState(0);
  const [bulkType, setBulkType] = useState<"percent" | "fixed">("percent");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const getAuthHeaders = () => {
    const token = localStorage.getItem("pharma_token");
    return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
  };

  const load = () => {
    setLoading(true);
    apiClient("/api/seller/pricing").then(d => {
      setCategories(d.categories || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const showMsg = (text: string) => { setMsg(text); setTimeout(() => setMsg(""), 3000); };

  const handleSaveProduct = async (id: number) => {
    setSaving(true);
    try {
      const data = await apiClient(`/api/seller/pricing/product/${id}`, {
        method: "PUT",
        body: JSON.stringify(editForm),
      });
      if (data.success) showMsg("✅ บันทึกราคาแล้ว");
      setEditingId(null);
      load();
    } catch {}
    setSaving(false);
  };

  const handleBulkAll = async () => {
    setSaving(true);
    try {
      const body = bulkType === "percent" ? { marginPercent: bulkPercent, marginType: "percent" } : { price: bulkPrice, marginType: "fixed" };
      const data = await apiClient("/api/seller/pricing/all", {
        method: "PUT", body: JSON.stringify(body),
      });
      showMsg(`✅ อัปเดตราคาแล้ว ${data.updated}/${data.total} รายการ`);
      setBulkMode(null);
      load();
    } catch {}
    setSaving(false);
  };

  const handleBulkCategory = async (catId: number) => {
    setSaving(true);
    try {
      const body = bulkType === "percent" ? { marginPercent: bulkPercent, marginType: "percent" } : { price: bulkPrice, marginType: "fixed" };
      const data = await apiClient(`/api/seller/pricing/category/${catId}`, {
        method: "PUT", body: JSON.stringify(body),
      });
      showMsg(`✅ อัปเดตหมวด ${data.updated}/${data.total} รายการ`);
      setBulkMode(null);
      load();
    } catch {}
    setSaving(false);
  };

  // Filter products by search
  const filterProducts = (products: ProductPrice[]) => {
    if (!searchTerm) return products;
    const t = searchTerm.toLowerCase();
    return products.filter(p =>
      p.nameTh.toLowerCase().includes(t) ||
      p.nameEn.toLowerCase().includes(t) ||
      p.sku.toLowerCase().includes(t) ||
      (p.barcode && p.barcode.includes(t))
    );
  };

  const fm = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmInt = (n: number) => Math.round(n).toLocaleString("th-TH");

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">💰 กำหนดราคาสินค้า</h1>
          <p className="text-sm text-gray-500 mt-1">ตั้งราคาขายแบบ % markup หรือราคาคงที่ พร้อมรองรับหลายหน่วยขาย</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" placeholder="🔍 ค้นหาสินค้า..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-200" />
          <button onClick={() => setBulkMode("all")}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap">
            ⚡ ตั้งราคาทั้งหมด
          </button>
        </div>
      </div>

      {msg && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 flex items-center gap-2">
          <span>✅</span> {msg}
        </div>
      )}

      {/* Bulk All Modal */}
      {bulkMode === "all" && (
        <div className="mb-6 bg-white rounded-2xl border border-blue-100 shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-3">⚡ ตั้งราคาทั้งหมด</h3>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setBulkType("percent")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${bulkType === "percent" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                % Markup
              </button>
              <button onClick={() => setBulkType("fixed")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${bulkType === "fixed" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                ราคาคงที่
              </button>
            </div>
            {bulkType === "percent" ? (
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Margin</label>
                <input type="number" value={bulkPercent} onChange={(e) => setBulkPercent(parseInt(e.target.value) || 0)}
                  className="w-20 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-200" />
                <span className="text-sm text-gray-400">%</span>
                <p className="text-xs text-gray-400 ml-2">ราคาขาย = ทุน × (1 + {bulkPercent}%)</p>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">ราคาขาย</label>
                <input type="number" value={bulkPrice} onChange={(e) => setBulkPrice(parseFloat(e.target.value) || 0)}
                  className="w-24 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-200" />
                <span className="text-sm text-gray-400">บาท</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleBulkAll} disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? "⏳ กำลังบันทึก..." : "✅ ยืนยันตั้งราคาทั้งหมด"}
            </button>
            <button onClick={() => setBulkMode(null)}
              className="px-5 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors">ยกเลิก</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-16 text-gray-400">ยังไม่มีสินค้า — กรุณาซิงค์ Forte ก่อน</div>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => {
            const filtered = filterProducts(cat.products);
            if (filtered.length === 0) return null;
            return (
              <div key={cat.categoryId} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                {/* Category Header */}
                <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedCat(expandedCat === cat.categoryId ? null : cat.categoryId)}>
                  <div className="flex items-center gap-3">
                    <span className="text-lg w-5 text-center">{expandedCat === cat.categoryId ? "▼" : "▶"}</span>
                    <div>
                      <span className="font-semibold text-gray-900">{cat.categoryName}</span>
                      <span className="text-sm text-gray-400 ml-2">{filtered.length}/{cat.count} รายการ</span>
                      {cat.hasCost > 0 && (
                        <span className="text-xs bg-green-100 text-green-700 ml-2 px-2 py-0.5 rounded-full">
                          มีทุน {cat.hasCost} รายการ
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setBulkMode(cat.categoryId); }}
                    className="px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-medium rounded-lg hover:bg-blue-100 transition-colors">
                    ตั้งราคาหมวดนี้
                  </button>
                </div>

                {/* Bulk Category Modal */}
                {bulkMode === cat.categoryId && (
                  <div className="p-4 bg-blue-50 border-t border-blue-100">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-medium text-gray-700">ตั้งราคาหมวด "{cat.categoryName}":</span>
                      <div className="flex gap-1 bg-white rounded-lg p-0.5 border">
                        <button onClick={() => setBulkType("percent")}
                          className={`px-2.5 py-1 rounded text-xs font-medium ${bulkType === "percent" ? "bg-blue-600 text-white" : "text-gray-500"}`}>%</button>
                        <button onClick={() => setBulkType("fixed")}
                          className={`px-2.5 py-1 rounded text-xs font-medium ${bulkType === "fixed" ? "bg-blue-600 text-white" : "text-gray-500"}`}>฿</button>
                      </div>
                      {bulkType === "percent" ? (
                        <><input type="number" value={bulkPercent} onChange={(e) => setBulkPercent(parseInt(e.target.value) || 0)}
                          className="w-16 px-2 py-1 border border-gray-200 rounded text-sm text-center focus:outline-none" /><span className="text-xs text-gray-400">%</span></>
                      ) : (
                        <><input type="number" value={bulkPrice} onChange={(e) => setBulkPrice(parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 border border-gray-200 rounded text-sm text-center focus:outline-none" /><span className="text-xs text-gray-400">บาท</span></>
                      )}
                      <button onClick={() => handleBulkCategory(cat.categoryId)} disabled={saving}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">ยืนยัน</button>
                      <button onClick={() => setBulkMode(null)}
                        className="px-3 py-1.5 bg-white text-gray-500 text-xs rounded-lg border hover:bg-gray-50 transition-colors">ยกเลิก</button>
                    </div>
                  </div>
                )}

                {/* Products */}
                {expandedCat === cat.categoryId && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {/* Column headers */}
                    <div className="hidden md:flex items-center px-4 py-2 bg-gray-50 text-xs font-medium text-gray-400 uppercase tracking-wider">
                      <div className="flex-1">สินค้า</div>
                      <div className="w-24 text-right">ราคาทุน</div>
                      <div className="w-20 text-right">Margin</div>
                      <div className="w-24 text-right">ราคาขาย</div>
                      <div className="w-24 text-right">กำไร</div>
                      <div className="w-16" />
                    </div>

                    {filtered.map((p) => (
                      editingId === p.id ? (
                        <div key={p.id} className="p-4 bg-blue-50/50">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
                            <div className="lg:col-span-2">
                              <label className="block text-xs text-gray-500 mb-1 font-medium">ชื่อสินค้า</label>
                              <span className="text-sm font-medium text-gray-900">{p.nameTh}</span>
                              <span className="text-xs text-gray-400 ml-2">{p.sku}</span>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1 font-medium">ราคาทุน (ต้นทุน)</label>
                              <div className="relative">
                                <input type="number" value={editForm.costPrice}
                                  onChange={(e) => {
                                    const cp = parseFloat(e.target.value) || 0;
                                    const upd: Record<string, UnitPriceInfo> = {};
                                    // Also update unit cost prices proportionally
                                    for (const uk of Object.keys(editForm.unitPricing)) {
                                      const up = editForm.unitPricing[uk];
                                      if (up.costPrice !== undefined) {
                                        upd[uk] = { ...up, costPrice: Math.round(cp * (up.costPrice / (editForm.costPrice || 1) || 1)) };
                                      }
                                    }
                                    setEditForm({
                                      ...editForm, costPrice: cp,
                                      marginPercent: cp > 0 ? Math.round(((editForm.price - cp) / cp) * 100) : 0,
                                      unitPricing: { ...editForm.unitPricing, ...upd },
                                    });
                                  }}
                                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">฿</span>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1 font-medium">
                                <select value={editForm.marginType} onChange={(e) => setEditForm({...editForm, marginType: e.target.value as "percent" | "fixed"})}
                                  className="bg-transparent border-none p-0 text-xs text-gray-500 font-medium focus:outline-none cursor-pointer">
                                  <option value="percent">Markup %</option>
                                  <option value="fixed">ราคาคงที่</option>
                                </select>
                              </label>
                              {editForm.marginType === "percent" ? (
                                <div className="relative">
                                  <input type="number" value={editForm.marginPercent}
                                    onChange={(e) => {
                                      const pct = parseFloat(e.target.value) || 0;
                                      setEditForm({
                                        ...editForm, marginPercent: pct,
                                        price: editForm.costPrice > 0 ? Math.ceil(editForm.costPrice * (1 + pct / 100)) : editForm.price,
                                      });
                                    }}
                                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                                </div>
                              ) : (
                                <div className="relative">
                                  <input type="number" value={editForm.price}
                                    onChange={(e) => {
                                      const p = parseFloat(e.target.value) || 0;
                                      setEditForm({
                                        ...editForm, price: p,
                                        marginPercent: editForm.costPrice > 0 ? Math.round(((p - editForm.costPrice) / editForm.costPrice) * 100) : 0,
                                      });
                                    }}
                                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm font-bold text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">฿</span>
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1 font-medium">ราคาขาย</label>
                              <div className="relative">
                                <input type="number" value={editForm.price}
                                  onChange={(e) => {
                                    const p = parseFloat(e.target.value) || 0;
                                    setEditForm({
                                      ...editForm, price: p,
                                      marginPercent: editForm.costPrice > 0 ? Math.round(((p - editForm.costPrice) / editForm.costPrice) * 100) : 0,
                                    });
                                  }}
                                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm font-bold text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">฿</span>
                              </div>
                              {editForm.costPrice > 0 && (
                                <p className={`text-xs mt-1 font-medium ${(editForm.price - editForm.costPrice) > 0 ? "text-green-600" : "text-red-500"}`}>
                                  กำไร {fmInt(editForm.price - editForm.costPrice)} ฿
                                </p>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1 font-medium">บาร์โค้ด</label>
                              <input type="text" value={editForm.barcode}
                                onChange={(e) => setEditForm({...editForm, barcode: e.target.value})}
                                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-200" />
                            </div>
                          </div>

                          {/* Multi-unit pricing section */}
                          <div className="mt-4 pt-4 border-t border-blue-100">
                            <p className="text-xs font-medium text-gray-500 mb-2">📦 ราคาแยกตามหน่วยขาย</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {ALL_UNITS.map((unit) => {
                                const up = editForm.unitPricing[unit.key] || {};
                                const unitPrice = up.price ?? (unit.key === "piece" ? editForm.price : 0);
                                const unitCost = up.costPrice ?? (unit.key === "piece" ? editForm.costPrice : 0);
                                const unitMargin = up.marginPercent ?? (unitCost > 0 ? Math.round(((unitPrice - unitCost) / unitCost) * 100) : 0);
                                return (
                                  <div key={unit.key} className="bg-white rounded-lg border border-gray-100 p-2.5">
                                    <label className="text-xs font-medium text-gray-600 mb-1 block">{unit.label}</label>
                                    <div className="flex items-center gap-1 mb-1">
                                      <input type="number" value={unitPrice}
                                        onChange={(e) => {
                                          const uprice = parseFloat(e.target.value) || 0;
                                          setEditForm({
                                            ...editForm,
                                            unitPricing: {
                                              ...editForm.unitPricing,
                                              [unit.key]: { ...editForm.unitPricing[unit.key], price: uprice },
                                            },
                                          });
                                        }}
                                        className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-200" />
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <input type="number" value={unitCost}
                                        onChange={(e) => {
                                          const ucost = parseFloat(e.target.value) || 0;
                                          setEditForm({
                                            ...editForm,
                                            unitPricing: {
                                              ...editForm.unitPricing,
                                              [unit.key]: { ...editForm.unitPricing[unit.key], costPrice: ucost, marginPercent: ucost > 0 ? Math.round(((unitPrice - ucost) / ucost) * 100) : 0 },
                                            },
                                          });
                                        }}
                                        className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-200 text-gray-500" />
                                    </div>
                                    {unitCost > 0 && (
                                      <p className={`text-[10px] mt-1 font-medium ${(unitPrice - unitCost) > 0 ? "text-green-600" : "text-red-500"}`}>
                                        กำไร {fmInt(unitPrice - unitCost)} ฿ ({unitMargin > 0 ? "+" : ""}{unitMargin}%)
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex gap-2 mt-4">
                            <button onClick={() => handleSaveProduct(p.id)} disabled={saving}
                              className="px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1">
                              {saving ? "⏳" : "💾"} บันทึก
                            </button>
                            <button onClick={() => setEditingId(null)}
                              className="px-4 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors">ยกเลิก</button>
                          </div>
                        </div>
                      ) : (
                        <div key={p.id} className="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg flex items-center justify-center text-xs font-bold text-blue-600 flex-shrink-0">
                              {p.sku?.startsWith("FT") ? "FT" : "📦"}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{p.nameTh}</p>
                              <div className="flex items-center gap-2 text-xs text-gray-400">
                                {p.barcode && <span className="font-mono">🔲 {p.barcode}</span>}
                                <span>{p.sku}</span>
                                <span className="text-gray-300">|</span>
                                <span>{UNIT_LABELS[p.unit] || p.unit}</span>
                              </div>
                              {/* Quick unit price badges */}
                              {Object.keys(p.unitPricing).length > 0 && (
                                <div className="flex items-center gap-1.5 mt-1">
                                  {Object.entries(p.unitPricing).slice(0, 4).map(([uk, up]) => (
                                    <span key={uk} className="text-[10px] bg-gray-50 text-gray-500 px-1.5 py-0.5 rounded border border-gray-100">
                                      {UNIT_LABELS[uk] || uk}: ฿{up.price || 0}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 flex-shrink-0">
                            <div className="text-right">
                              {p.costPrice > 0 ? (
                                <>
                                  <p className="text-xs text-gray-400">ทุน ฿{fm(p.costPrice)}</p>
                                  <p className="text-sm font-bold text-blue-600">฿{fm(p.price)}</p>
                                  <div className="flex items-center justify-end gap-1.5 mt-0.5">
                                    {p.marginPercent > 0 && <span className="text-xs text-green-600 font-medium">+{p.marginPercent}%</span>}
                                    {p.profit !== undefined && (
                                      <span className={`text-xs font-medium ${p.profit > 0 ? "text-emerald-600" : "text-red-500"}`}>
                                        กำไร {fmInt(p.profit)}฿
                                      </span>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <p className="text-xs text-gray-300">ไม่มีทุน</p>
                                  <p className="text-sm font-bold text-blue-600">฿{fm(p.price)}</p>
                                </>
                              )}
                            </div>
                            <button onClick={() => {
                              setEditingId(p.id);
                              setEditForm({
                                price: p.price, marginPercent: p.marginPercent || 0, costPrice: p.costPrice || 0,
                                barcode: p.barcode || "", marginType: (p.marginType as "percent" | "fixed") || "percent",
                                unitPricing: p.unitPricing || {},
                              });
                            }}
                              className="px-3 py-1.5 bg-gray-50 text-gray-500 text-xs rounded-lg hover:bg-gray-100 border border-gray-100 transition-colors">แก้ไข</button>
                          </div>
                        </div>
                      )
                    ))}
                    {filtered.length === 0 && searchTerm && (
                      <div className="p-6 text-center text-sm text-gray-400">ไม่พบสินค้าที่ค้นหา</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
