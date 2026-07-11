import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../lib/api";

interface Product {
  id: number;
  sku: string;
  nameTh: string;
  nameEn: string;
}

interface Batch {
  id: number;
  productId: number;
  batchNumber: string;
  expiryDate: string | null;
  quantity: number;
  initialQuantity: number;
  unitCost: number;
  supplier: string;
  status: string;
  createdAt: string;
}

interface Movement {
  id: number;
  batchId: number | null;
  productId: number;
  orderId: number | null;
  orderItemId: number | null;
  action: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  reference: string;
  notes: string;
  createdBy: number | null;
  createdAt: string;
  batchNumber: string | null;
  orderNumber: string | null;
  productNameTh: string | null;
  userName: string | null;
}

interface TraceProductData {
  product: Product;
  batches: Batch[];
  movements: Movement[];
}

interface TraceBatchData {
  batch: Batch & { productName: string; productSku: string };
  movements: Movement[];
}

interface TraceOrderData {
  order: any;
  items: any[];
}

interface BatchCustomer {
  userId: number;
  customerName: string;
  customerCode: string | null;
  phone: string;
  orderNumber: string;
  quantity: number;
  soldAt: string;
}

interface CustomerSearchResult {
  id: number;
  customerCode: string | null;
  fullName: string;
  email: string;
  phone: string;
  orderCount: number;
}

const ACTION_LABELS: Record<string, string> = {
  receive: "รับเข้า",
  sell: "ขาย",
  return: "คืนสินค้า",
  adjust: "ปรับปรุง",
  expire: "หมดอายุ",
  transfer: "โอนย้าย",
};

const ACTION_COLORS: Record<string, string> = {
  receive: "text-green-600 bg-green-50",
  sell: "text-red-600 bg-red-50",
  return: "text-blue-600 bg-blue-50",
  adjust: "text-amber-600 bg-amber-50",
  expire: "text-gray-600 bg-gray-50",
  transfer: "text-purple-600 bg-purple-50",
};

const getAuthHeaders = () => {
  const token = localStorage.getItem("pharma_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function TraceabilityPage() {
  const [mode, setMode] = useState<"product" | "batch" | "order">("product");
  const [searchId, setSearchId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [traceData, setTraceData] = useState<TraceProductData | TraceBatchData | TraceOrderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Customer search
  const [customerSearchQ, setCustomerSearchQ] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerSearchResult[]>([]);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [batchCustomers, setBatchCustomers] = useState<BatchCustomer[]>([]);
  const [batchCustomersLoading, setBatchCustomersLoading] = useState(false);

  const exportCsv = () => {
    const token = localStorage.getItem("pharma_token");
    fetch("/api/export/stock-movements.csv", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "stock-movements.csv";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => alert("ไม่สามารถดาวน์โหลดรายงานได้"));
  };

  // Load products for dropdown
  useEffect(() => {
    apiClient("/api/products?limit=200")
      
      .then((data) => {
        const items = data.items || [];
        setProducts(items);
        setFilteredProducts(items);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!productSearch) {
      setFilteredProducts(products);
    } else {
      const q = productSearch.toLowerCase();
      setFilteredProducts(
        products.filter(
          (p) =>
            p.nameTh.toLowerCase().includes(q) ||
            p.nameEn.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q)
        )
      );
    }
  }, [productSearch, products]);

  // Fetch batch customers when batch trace data loads
  useEffect(() => {
    if (mode === "batch" && traceData && "batch" in traceData) {
      fetchBatchCustomers(traceData.batch.id);
    }
  }, [mode, traceData]);

  const traceByProduct = async (productId: number) => {
    setLoading(true);
    setError("");
    setTraceData(null);
    try {
      const data = await apiClient(`/api/trace/product/${productId}`);
      setTraceData(data as TraceProductData);
    } catch (e: any) {
      setError(e?.message || "Error");
    }
    setLoading(false);
  };

  const traceByBatch = async () => {
    if (!searchId) return;
    setLoading(true);
    setError("");
    setTraceData(null);
    try {
      const data = await apiClient(`/api/trace/batch/${searchId}`);
      setTraceData(data as TraceBatchData);
      setMode("batch");
    } catch (e: any) {
      setError(e?.message || "Error");
    }
    setLoading(false);
  };

  const traceByOrder = async () => {
    if (!searchId) return;
    setLoading(true);
    setError("");
    setTraceData(null);
    try {
      const data = await apiClient(`/api/trace/order/${searchId}`);
      setTraceData(data as TraceOrderData);
      setMode("order");
    } catch (e: any) {
      setError(e?.message || "Error");
    }
    setLoading(false);
  };

  const searchCustomers = async () => {
    if (!customerSearchQ.trim()) return;
    setCustomerSearchLoading(true);
    setCustomerResults([]);
    try {
      const data = await apiClient(`/api/customers/search?q=${encodeURIComponent(customerSearchQ)}`);
      setCustomerResults(data.customers || []);
    } catch {}
    setCustomerSearchLoading(false);
  };

  const fetchBatchCustomers = async (batchId: number) => {
    setBatchCustomersLoading(true);
    setBatchCustomers([]);
    try {
      const data = await apiClient(`/api/trace/batch/${batchId}/customers`);
      setBatchCustomers(data.customers || []);
    } catch {}
    setBatchCustomersLoading(false);
  };

  const handleSearch = () => {
    if (mode === "product" && selectedProductId) {
      traceByProduct(selectedProductId);
    } else if (mode === "batch") {
      traceByBatch();
    } else if (mode === "order") {
      traceByOrder();
    } else if (mode === "customer") {
      searchCustomers();
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🔍 ระบบติดตาม (Traceability)</h1>
        <button onClick={exportCsv}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700 transition-all">
          📥 Export CSV
        </button>
      </div>

      {/* Mode selector */}
      <div className="flex gap-2 mb-4">
        {(["product", "batch", "order", "customer"] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setTraceData(null); setSearchId(""); setCustomerResults([]); setBatchCustomers([]); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              mode === m ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {m === "product" ? "📦 ตามสินค้า" : m === "batch" ? "🏷️ ตาม Batch" : m === "order" ? "📋 ตามออเดอร์" : "👤 ตามลูกค้า"}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
        {mode === "product" ? (
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="พิมพ์ชื่อหรือรหัสสินค้า..."
                className="w-full border rounded-lg px-3 py-2"
              />
              {productSearch && (
                <div className="border rounded-b-lg max-h-40 overflow-y-auto mt-1 shadow-sm">
                  {filteredProducts.slice(0, 20).map((p) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedProductId(p.id);
                        setProductSearch(`${p.sku} - ${p.nameTh}`);
                      }}
                      className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm"
                    >
                      <span className="font-mono text-xs text-gray-500">{p.sku}</span> {p.nameTh}
                    </div>
                  ))}
                  {filteredProducts.length === 0 && (
                    <div className="px-3 py-2 text-gray-400 text-sm">ไม่พบสินค้า</div>
                  )}
                </div>
              )}
            </div>
            <button onClick={handleSearch} disabled={!selectedProductId}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              🔍 ค้นหา
            </button>
          </div>
        ) : mode === "batch" ? (
          <div className="flex gap-2">
            <input value={searchId} onChange={(e) => setSearchId(e.target.value)}
              placeholder="Batch ID (ตัวเลข)..." className="flex-1 border rounded-lg px-3 py-2" />
            <button onClick={handleSearch} disabled={!searchId}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              🔍 ค้นหา
            </button>
          </div>
        ) : mode === "order" ? (
          <div className="flex gap-2">
            <input value={searchId} onChange={(e) => setSearchId(e.target.value)}
              placeholder="Order ID (ตัวเลข)..." className="flex-1 border rounded-lg px-3 py-2" />
            <button onClick={handleSearch} disabled={!searchId}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              🔍 ค้นหา
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input value={customerSearchQ} onChange={(e) => setCustomerSearchQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") searchCustomers(); }}
              placeholder="ค้นหาลูกค้า (ชื่อ, เบอร์โทร, อีเมล, รหัสลูกค้า)..." className="flex-1 border rounded-lg px-3 py-2" />
            <button onClick={searchCustomers} disabled={!customerSearchQ.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              🔍 ค้นหา
            </button>
          </div>
        )}
      </div>

      {loading && <div className="text-center py-8 text-gray-500">กำลังโหลด...</div>}
      {error && <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-4">{error}</div>}

      {/* Customer search results */}
      {mode === "customer" && (
        <div className="mb-6">
          {customerSearchLoading && <div className="text-center py-4 text-gray-500">กำลังค้นหา...</div>}
          {!customerSearchLoading && customerResults.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border">
              <h3 className="px-4 py-3 font-semibold border-b">👤 ผลการค้นหาลูกค้า ({customerResults.length} รายการ)</h3>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">ชื่อ</th>
                    <th className="px-4 py-2 text-left">รหัสลูกค้า</th>
                    <th className="px-4 py-2 text-left">อีเมล</th>
                    <th className="px-4 py-2 text-left">เบอร์โทร</th>
                    <th className="px-4 py-2 text-right">จำนวนออเดอร์</th>
                    <th className="px-4 py-2 text-center"></th>
                  </tr>
                </thead>
                <tbody>
                  {customerResults.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{c.fullName}</td>
                      <td className="px-4 py-2 font-mono text-xs text-blue-600">{c.customerCode || "-"}</td>
                      <td className="px-4 py-2 text-xs">{c.email || "-"}</td>
                      <td className="px-4 py-2 text-xs">{c.phone || "-"}</td>
                      <td className="px-4 py-2 text-right">{c.orderCount}</td>
                      <td className="px-4 py-2 text-center">
                        <Link to={`/seller/customers/${c.id}`}
                          className="text-blue-600 hover:underline text-xs">
                          ดูรายละเอียด →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!customerSearchLoading && customerSearchQ && customerResults.length === 0 && (
            <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400">ไม่พบลูกค้า</div>
          )}
        </div>
      )}

      {/* Results */}
      {traceData && !loading && (
        <div className="space-y-6">
          {mode === "product" && "product" in traceData && (
            <>
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <h2 className="text-lg font-semibold mb-2">
                  {traceData.product.nameTh} <span className="text-sm text-gray-500 font-mono">({traceData.product.sku})</span>
                </h2>
                <p className="text-sm text-gray-500">จำนวน Batch ทั้งหมด: {traceData.batches?.length || 0} batches</p>
              </div>

              {/* Batches */}
              {traceData.batches && traceData.batches.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border">
                  <h3 className="px-4 py-3 font-semibold border-b">🏷️ Batch/Lot ทั้งหมด</h3>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">Batch/Lot</th>
                        <th className="px-4 py-2 text-left">หมดอายุ</th>
                        <th className="px-4 py-2 text-right">จำนวนคงเหลือ</th>
                        <th className="px-4 py-2 text-right">ต้นทุน/หน่วย</th>
                        <th className="px-4 py-2 text-left">ซัพพลายเออร์</th>
                        <th className="px-4 py-2 text-center">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {traceData.batches.map((b) => (
                        <tr key={b.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-2 font-mono">{b.batchNumber}</td>
                          <td className="px-4 py-2">{b.expiryDate || "-"}</td>
                          <td className="px-4 py-2 text-right">{b.quantity}</td>
                          <td className="px-4 py-2 text-right">{b.unitCost?.toFixed(2)}</td>
                          <td className="px-4 py-2">{b.supplier || "-"}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              b.status === "active" ? "bg-green-100 text-green-800" :
                              b.status === "expired" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800"
                            }`}>{b.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Movements */}
              {traceData.movements && traceData.movements.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border">
                  <h3 className="px-4 py-3 font-semibold border-b">📋 ประวัติเคลื่อนไหว</h3>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">วันที่</th>
                        <th className="px-4 py-2 text-left">การดำเนินการ</th>
                        <th className="px-4 py-2 text-right">จำนวน</th>
                        <th className="px-4 py-2 text-left">Batch</th>
                        <th className="px-4 py-2 text-left">ออเดอร์</th>
                      </tr>
                    </thead>
                    <tbody>
                      {traceData.movements.map((m) => (
                        <tr key={m.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-2 text-xs">{m.createdAt}</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[m.action] || ""}`}>
                              {ACTION_LABELS[m.action] || m.action}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right">{m.quantity}</td>
                          <td className="px-4 py-2 font-mono text-xs">{m.batchNumber || "-"}</td>
                          <td className="px-4 py-2 font-mono text-xs">{m.orderNumber || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {mode === "batch" && "batch" in traceData && (
            <>
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <h2 className="text-lg font-semibold mb-2">
                  🏷️ Batch: {traceData.batch.batchNumber}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
                  <div><span className="text-gray-500">สินค้า:</span> {traceData.batch.productName}</div>
                  <div><span className="text-gray-500">SKU:</span> {traceData.batch.productSku}</div>
                  <div><span className="text-gray-500">หมดอายุ:</span> {traceData.batch.expiryDate || "-"}</div>
                  <div><span className="text-gray-500">คงเหลือ:</span> {traceData.batch.quantity}/{traceData.batch.initialQuantity}</div>
                  <div><span className="text-gray-500">ต้นทุน/หน่วย:</span> {traceData.batch.unitCost?.toFixed(2)}</div>
                  <div><span className="text-gray-500">ซัพพลายเออร์:</span> {traceData.batch.supplier || "-"}</div>
                  <div><span className="text-gray-500">สถานะ:</span> {traceData.batch.status}</div>
                  <div><span className="text-gray-500">วันที่รับ:</span> {traceData.batch.receivedDate}</div>
                </div>
              </div>

              {/* Customers who received from this batch */}
              <div className="bg-white rounded-xl shadow-sm border">
                <h3 className="px-4 py-3 font-semibold border-b">👤 ลูกค้าที่ได้รับสินค้าจาก Batch นี้</h3>
                {batchCustomersLoading ? (
                  <div className="p-4 text-center text-gray-400 text-sm">กำลังโหลด...</div>
                ) : batchCustomers.length === 0 ? (
                  <div className="p-4 text-center text-gray-400 text-sm">ไม่มีข้อมูลลูกค้า</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">ชื่อลูกค้า</th>
                        <th className="px-4 py-2 text-left">รหัสลูกค้า</th>
                        <th className="px-4 py-2 text-left">เบอร์โทร</th>
                        <th className="px-4 py-2 text-left">ออเดอร์</th>
                        <th className="px-4 py-2 text-right">จำนวน</th>
                        <th className="px-4 py-2 text-left">วันที่</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchCustomers.map((bc, i) => (
                        <tr key={i} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <Link to={`/seller/customers/${bc.userId}`} className="text-blue-600 hover:underline font-medium">
                              {bc.customerName}
                            </Link>
                          </td>
                          <td className="px-4 py-2 font-mono text-xs">{bc.customerCode || "-"}</td>
                          <td className="px-4 py-2 text-xs">{bc.phone || "-"}</td>
                          <td className="px-4 py-2 font-mono text-xs">{bc.orderNumber}</td>
                          <td className="px-4 py-2 text-right">{bc.quantity}</td>
                          <td className="px-4 py-2 text-xs">{bc.soldAt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {traceData.movements && traceData.movements.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border">
                  <h3 className="px-4 py-3 font-semibold border-b">📋 ประวัติการเคลื่อนไหวทั้งหมด</h3>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">วันที่</th>
                        <th className="px-4 py-2 text-left">การดำเนินการ</th>
                        <th className="px-4 py-2 text-right">จำนวน</th>
                        <th className="px-4 py-2 text-left">ออเดอร์</th>
                        <th className="px-4 py-2 text-left">ผู้ดำเนินการ</th>
                        <th className="px-4 py-2 text-left">หมายเหตุ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {traceData.movements.map((m) => (
                        <tr key={m.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-2 text-xs">{m.createdAt}</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[m.action] || ""}`}>
                              {ACTION_LABELS[m.action] || m.action}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right font-medium">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                          <td className="px-4 py-2 font-mono text-xs">{m.orderNumber || "-"}</td>
                          <td className="px-4 py-2 text-xs">{m.userName || "-"}</td>
                          <td className="px-4 py-2 text-xs text-gray-500">{m.notes || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {mode === "order" && "order" in traceData && (
            <>
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <h2 className="text-lg font-semibold mb-2">
                  📋 Order: {traceData.order.orderNumber || `#${traceData.order.id}`}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-3 text-sm">
                  <div><span className="text-gray-500">ลูกค้า:</span> {traceData.order.customerName}</div>
                  <div><span className="text-gray-500">ยอดรวม:</span> {traceData.order.grandTotal?.toFixed(2)}</div>
                  <div><span className="text-gray-500">สถานะ:</span> {traceData.order.status}</div>
                  <div><span className="text-gray-500">วันที่:</span> {traceData.order.orderedAt}</div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border">
                <h3 className="px-4 py-3 font-semibold border-b">สินค้าในออเดอร์</h3>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left">สินค้า</th>
                      <th className="px-4 py-2 text-right">จำนวน</th>
                      <th className="px-4 py-2 text-right">ราคา</th>
                      <th className="px-4 py-2 text-left">Batch/Lot</th>
                      <th className="px-4 py-2 text-left">วันหมดอายุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traceData.items.map((item: any, i: number) => (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2">{item.productNameTh || item.productNameEn}</td>
                        <td className="px-4 py-2 text-right">{item.quantity}</td>
                        <td className="px-4 py-2 text-right">{item.unitPrice?.toFixed(2)}</td>
                        <td className="px-4 py-2 font-mono">{item.batchNumber || "-"}</td>
                        <td className="px-4 py-2">{item.expiryDate || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
