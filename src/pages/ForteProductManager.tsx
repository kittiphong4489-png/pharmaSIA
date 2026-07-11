import { useState, useEffect } from "react";
import { RefreshCw, Database, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { apiClient } from "../lib/api";

interface SyncStats {
  totalProducts: number;
  syncedProducts: number;
  lastSync: string;
  categories: string[];
  totalPages: number;
  currentPage: number;
}

export default function ForteProductManager() {
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [syncedCats, setSyncedCats] = useState<string[]>([]);
  const [showCats, setShowCats] = useState(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("pharma_token");
    return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  };

  const t = (o: any) => ({ method: "POST", body: JSON.stringify(o) });

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    try {
      const data = await apiClient("/api/trpc/forteProxy.getSyncedCount", t({}));
      if (data.result?.data) setStats(data.result.data);
    } catch {}
  };

  const startSync = async () => {
    setSyncing(true); setProgress("🔄 กำลังดึงข้อมูลจาก Forte..."); setResult(null);
    try {
      const data = await apiClient("/api/trpc/forteProxy.syncAllFull", {
        method: "POST",
        body: JSON.stringify({ username: "MK25-0264", password: "MK25-0264" }),
      });
      if (data.result?.data?.success) {
        setResult({ ok: true, msg: `✅ ซิงค์เสร็จ — ${data.result.data.message || ""}` });
        fetchStats();
      } else {
        setResult({ ok: false, msg: data.result?.data?.error || "❌ ซิงค์ล้มเหลว" });
      }
    } catch (e: any) { setResult({ ok: false, msg: "❌ " + e.message }); }
    setSyncing(false);
  };

  const syncPrices = async () => {
    setSyncing(true); setProgress("🔄 กำลังซิงค์ราคา..."); setResult(null);
    try {
      const data = await apiClient("/api/trpc/forteProxy.syncPricesOnly", t({}));
      setResult({ ok: true, msg: `✅ ซิงค์ราคาสำเร็จ: ${data.result?.data || ""}` });
      fetchStats();
    } catch (e: any) { setResult({ ok: false, msg: "❌ " + e.message }); }
    setSyncing(false);
  };

  const syncCategories = async () => {
    setSyncing(true); setProgress("🔄 กำลังซิงค์หมวดหมู่..."); setResult(null);
    try {
      const data = await apiClient("/api/trpc/forteProxy.getForteCategories", t({}));
      if (data.result?.data) {
        const cats = data.result.data;
        setCategories(cats);
        setResult({ ok: true, msg: `✅ พบ ${cats.length} หมวดหมู่` });
      }
    } catch (e: any) { setResult({ ok: false, msg: "❌ " + e.message }); }
    setSyncing(false);
  };

  const syncByCategory = async (cat: string) => {
    setSyncing(true); setProgress(`🔄 กำลังซิงค์ ${cat}...`);
    try {
      const data = await apiClient("/api/trpc/forteProxy.syncByCategory", t({ category: cat }));
      if (data.result?.data?.success) {
        setSyncedCats(prev => [...prev, cat]);
        setResult({ ok: true, msg: `✅ ${cat} ซิงค์สำเร็จ` });
      }
    } catch (e: any) { setResult({ ok: false, msg: `❌ ${cat}: ${e.message}` }); }
    setSyncing(false);
  };

  const remap = async () => {
    setSyncing(true); setProgress("🔄 กำลังจัดหมวดหมู่..."); setResult(null);
    try {
      const data = await apiClient("/api/trpc/forteProxy.remapCategories", t({}));
      setResult({ ok: true, msg: `✅ จัดหมวดหมู่สำเร็จ: ${data.result?.data || ""}` });
      fetchStats();
    } catch (e: any) { setResult({ ok: false, msg: "❌ " + e.message }); }
    setSyncing(false);
  };

  const pushToCloud = async () => {
    setSyncing(true); setProgress("☁️ กำลังส่งข้อมูลขึ้น Cloud..."); setResult(null);
    try {
      const data = await apiClient("/api/trpc/forteProxy.saveToDb", t({ mode: "full", cloudUrl: "https://pharmacare-1783398975-production.up.railway.app" }));
      if (data.result?.data?.success) {
        setResult({ ok: true, msg: `✅ ส่งข้อมูลขึ้น Cloud สำเร็จ!` });
      } else {
        setResult({ ok: false, msg: data.result?.data?.error || "❌ ส่งข้อมูลล้มเหลว" });
      }
    } catch (e: any) { setResult({ ok: false, msg: "❌ " + e.message }); }
    setSyncing(false);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2"><Database className="w-6 h-6 text-blue-500" /> จัดการสินค้าจาก Forte</h1>

      {/* Stats */}
      {stats && (
        <div className="bg-white border border-gray-100 rounded-xl p-5 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div><p className="text-2xl font-bold text-blue-600">{stats.totalProducts}</p><p className="text-xs text-gray-500">สินค้าทั้งหมด</p></div>
            <div><p className="text-2xl font-bold text-green-600">{stats.syncedProducts}</p><p className="text-xs text-gray-500">ซิงค์แล้ว</p></div>
            <div><p className="text-sm font-medium text-gray-700">{stats.lastSync || "-"}</p><p className="text-xs text-gray-500">ซิงค์ล่าสุด</p></div>
            <div><p className="text-2xl font-bold text-gray-600">{stats.totalPages || "-"}</p><p className="text-xs text-gray-500">หน้า</p></div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 mb-6 space-y-3">
        <h2 className="font-semibold text-gray-900">ดำเนินการ</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={startSync} disabled={syncing} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">🔄 ซิงค์ทั้งหมด</button>
          <button onClick={syncPrices} disabled={syncing} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">💰 ซิงค์ราคา</button>
          <button onClick={remap} disabled={syncing} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">🏷 จัดหมวดหมู่</button>
          <button onClick={pushToCloud} disabled={syncing} className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50">☁️ Push to Cloud</button>
        </div>

        {progress && <p className="text-sm text-gray-500">{progress}</p>}
        {result && (
          <div className={`p-3 rounded-lg text-sm ${result.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {result.ok ? <CheckCircle className="w-4 h-4 inline mr-1" /> : <XCircle className="w-4 h-4 inline mr-1" />}
            {result.msg}
          </div>
        )}
      </div>

      {/* Stock Management */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">📦 จัดการสต๊อกสินค้า</h2>
        <p className="text-sm text-gray-500 mb-4">Forte API ไม่มีจำนวนสต๊อกตรงๆ — ตั้งค่าสินค้าหมด/มีสินค้าด้วยตนเอง</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={async () => {
            setSyncing(true); setProgress("⏳ กำลังตั้งค่าสินค้าหมดทั้งหมด..."); setResult(null);
            try {
              const d = await apiClient("/api/trpc/forteProxy.saveToDb", t({ stockMode: "all_out_of_stock" }));
              setResult({ ok: true, msg: "✅ ตั้งค่าสินค้าหมดทั้งหมดแล้ว — กดซิงค์อีกครั้งเพื่ออัปเดต" });
            } catch (e: any) { setResult({ ok: false, msg: "❌ " + e.message }); }
            setSyncing(false);
          }} disabled={syncing} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
            ❌ ตั้งค่าสินค้าหมดทั้งหมด
          </button>
          <button onClick={async () => {
            setSyncing(true); setProgress("⏳ กำลังตั้งค่าสินค้ามีสต๊อก..."); setResult(null);
            try {
              const d = await apiClient("/api/trpc/forteProxy.saveToDb", t({ stockMode: "all_in_stock" }));
              setResult({ ok: true, msg: "✅ ตั้งค่าสินค้ามีสต๊อกทั้งหมดแล้ว" });
            } catch (e: any) { setResult({ ok: false, msg: "❌ " + e.message }); }
            setSyncing(false);
          }} disabled={syncing} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
            ✅ ตั้งค่าสินค้ามีสต๊อกทั้งหมด
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          💡 แนะนำ: ซิงค์ทั้งหมด → ตรวจสอบสินค้าที่หมด → กด "ตั้งค่าสินค้าหมด" สำหรับรายการที่ต้องการ
        </p>
      </div>
    </div>
  );
}
