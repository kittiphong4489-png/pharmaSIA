import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";

interface Transaction {
  id: number;
  transactionType: string;
  referenceType: string;
  referenceId: number | null;
  description: string;
  amount: number;
  tax: number;
  totalAmount: number;
  paymentMethod: string;
  status: string;
  transactionDate: string;
  createdBy: number | null;
  createdAt: string;
}

interface SummaryRow {
  period: string;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  transactionCount: number;
}

interface Totals {
  totalRevenue: number;
  totalExpenses: number;
  totalTransactions: number;
}

const TX_TYPE_LABELS: Record<string, string> = {
  sale: "ขาย",
  purchase: "ซื้อสินค้า",
  expense: "ค่าใช้จ่าย",
  income: "รายได้อื่น",
  adjustment: "ปรับปรุง",
};

const TX_TYPE_COLORS: Record<string, string> = {
  sale: "text-green-600 bg-green-50",
  purchase: "text-red-600 bg-red-50",
  expense: "text-red-600 bg-red-50",
  income: "text-blue-600 bg-blue-50",
  adjustment: "text-amber-600 bg-amber-50",
};

const getAuthHeaders = () => {
  const token = localStorage.getItem("pharma_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function AccountingPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryPeriod, setSummaryPeriod] = useState("daily");
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error">("success");
  const [tab, setTab] = useState<"transactions" | "summary">("transactions");
  const [filterType, setFilterType] = useState("");
  const [form, setForm] = useState({
    transactionType: "expense",
    description: "",
    amount: 0,
    tax: 0,
    paymentMethod: "cash",
    transactionDate: new Date().toISOString().split("T")[0],
  });

  const loadData = () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (filterType) params.set("type", filterType);

    Promise.all([
      apiClient(`/api/accounting/transactions?${params}`),
      apiClient(`/api/accounting/summary?period=${summaryPeriod}`),
    ]).then(([txData, sumData]) => {
      setTransactions(txData.transactions || []);
      setSummary(sumData.summary || []);
      setTotals(sumData.totals || null);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [filterType, summaryPeriod]);

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => setMsg(""), 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    try {
      const data = await apiClient("/api/accounting/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(form),
      });
      if (data.success) {
        showMsg("✅ บันทึกรายการบัญชีสำเร็จ");
        setShowForm(false);
        setForm({ transactionType: "expense", description: "", amount: 0, tax: 0, paymentMethod: "cash", transactionDate: new Date().toISOString().split("T")[0] });
        loadData();
      } else {
        showMsg(`❌ ${data.error}`, "error");
      }
    } catch (e: any) {
      showMsg(`❌ ${e?.message || "Error"}`, "error");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("ยืนยันลบรายการนี้?")) return;
    try {
      const data = await apiClient(`/api/accounting/transactions/${id}`, { method: "DELETE" });
      if (data.success) {
        showMsg("🗑️ ลบรายการแล้ว");
        loadData();
      } else {
        showMsg(`❌ ${data.error}`, "error");
      }
    } catch (e: any) {
      showMsg(`❌ ${e?.message}`, "error");
    }
  };

  const formatCurrency = (n: number) => {
    return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">💰 ระบบบัญชีพื้นฐาน</h1>
        <a
          href="/api/export/orders.csv"
          onClick={(e) => { e.preventDefault(); window.open("/api/export/orders.csv", "_blank"); }}
          className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700"
        >
          📥 Export CSV
        </a>
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-lg ${msgType === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
          {msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab("transactions")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "transactions" ? "bg-blue-600 text-white" : "bg-gray-100 hover:bg-gray-200"}`}>
          📋 รายการเดินบัญชี
        </button>
        <button onClick={() => setTab("summary")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "summary" ? "bg-blue-600 text-white" : "bg-gray-100 hover:bg-gray-200"}`}>
          📊 สรุปยอด
        </button>
      </div>

      {tab === "transactions" && (
        <>
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">กรอง:</label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm">
                <option value="">ทั้งหมด</option>
                <option value="sale">ขาย</option>
                <option value="purchase">ซื้อสินค้า</option>
                <option value="expense">ค่าใช้จ่าย</option>
                <option value="income">รายได้อื่น</option>
                <option value="adjustment">ปรับปรุง</option>
              </select>
            </div>
            <button onClick={() => setShowForm(!showForm)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
              {showForm ? "✕ ยกเลิก" : "+ เพิ่มรายการ"}
            </button>
          </div>

          {/* Add transaction form */}
          {showForm && (
            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border p-6 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ประเภท *</label>
                <select required value={form.transactionType} onChange={(e) => setForm({ ...form, transactionType: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2">
                  <option value="sale">ขาย</option>
                  <option value="purchase">ซื้อสินค้า</option>
                  <option value="expense">ค่าใช้จ่าย</option>
                  <option value="income">รายได้อื่น</option>
                  <option value="adjustment">ปรับปรุง</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงิน *</label>
                <input type="number" required min="0" step="0.01" value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ภาษี</label>
                <input type="number" min="0" step="0.01" value={form.tax}
                  onChange={(e) => setForm({ ...form, tax: parseFloat(e.target.value) || 0 })}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">วิธีชำระ</label>
                <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2">
                  <option value="cash">เงินสด</option>
                  <option value="transfer">โอน</option>
                  <option value="credit">บัตรเครดิต</option>
                  <option value="promptpay">พร้อมเพย์</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">วันที่</label>
                <input type="date" value={form.transactionDate}
                  onChange={(e) => setForm({ ...form, transactionDate: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">คำอธิบาย</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2" placeholder="รายละเอียด..." />
              </div>
              <div className="flex items-end">
                <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 w-full">
                  💾 บันทึก
                </button>
              </div>
            </form>
          )}

          {/* Transactions table */}
          {loading ? (
            <div className="text-center py-8 text-gray-500">กำลังโหลด...</div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border">
              <div className="text-4xl mb-2">💰</div>
              <p className="text-gray-500">ยังไม่มีรายการบัญชี</p>
            </div>
          ) : (
            <div className="overflow-x-auto bg-white rounded-xl shadow-sm border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left">วันที่</th>
                    <th className="px-4 py-3 text-left">ประเภท</th>
                    <th className="px-4 py-3 text-left">รายการ</th>
                    <th className="px-4 py-3 text-right">จำนวนเงิน</th>
                    <th className="px-4 py-3 text-right">ภาษี</th>
                    <th className="px-4 py-3 text-right">รวม</th>
                    <th className="px-4 py-3 text-left">วิธีชำระ</th>
                    <th className="px-4 py-3 text-center">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs">{tx.transactionDate}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${TX_TYPE_COLORS[tx.transactionType] || ""}`}>
                          {TX_TYPE_LABELS[tx.transactionType] || tx.transactionType}
                        </span>
                      </td>
                      <td className="px-4 py-3">{tx.description || "-"}</td>
                      <td className={`px-4 py-3 text-right font-medium ${tx.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(tx.amount)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">{formatCurrency(tx.tax)}</td>
                      <td className={`px-4 py-3 text-right font-bold ${tx.totalAmount >= 0 ? "text-green-700" : "text-red-700"}`}>
                        {formatCurrency(tx.totalAmount)}
                      </td>
                      <td className="px-4 py-3 text-xs">{tx.paymentMethod}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleDelete(tx.id)}
                          className="text-red-500 hover:text-red-700 text-xs">🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "summary" && (
        <>
          <div className="mb-4">
            <select value={summaryPeriod} onChange={(e) => setSummaryPeriod(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm">
              <option value="daily">รายวัน</option>
              <option value="monthly">รายเดือน</option>
              <option value="yearly">รายปี</option>
            </select>
          </div>

          {/* Totals cards */}
          {totals && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-green-50 rounded-xl border border-green-200 p-4">
                <div className="text-sm text-green-600 font-medium">รายได้รวม</div>
                <div className="text-2xl font-bold text-green-700">฿{formatCurrency(totals.totalRevenue)}</div>
              </div>
              <div className="bg-red-50 rounded-xl border border-red-200 p-4">
                <div className="text-sm text-red-600 font-medium">ค่าใช้จ่ายรวม</div>
                <div className="text-2xl font-bold text-red-700">฿{formatCurrency(totals.totalExpenses)}</div>
              </div>
              <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                <div className="text-sm text-blue-600 font-medium">กำไรสุทธิ</div>
                <div className={`text-2xl font-bold ${totals.totalRevenue - totals.totalExpenses >= 0 ? "text-green-700" : "text-red-700"}`}>
                  ฿{formatCurrency(totals.totalRevenue - totals.totalExpenses)}
                </div>
              </div>
            </div>
          )}

          {/* Summary table */}
          {loading ? (
            <div className="text-center py-8 text-gray-500">กำลังโหลด...</div>
          ) : summary.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border">
              <p className="text-gray-500">ไม่มีข้อมูลในช่วงนี้</p>
            </div>
          ) : (
            <div className="overflow-x-auto bg-white rounded-xl shadow-sm border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left">ช่วงเวลา</th>
                    <th className="px-4 py-3 text-right">รายได้</th>
                    <th className="px-4 py-3 text-right">ค่าใช้จ่าย</th>
                    <th className="px-4 py-3 text-right">กำไรสุทธิ</th>
                    <th className="px-4 py-3 text-center">จำนวนรายการ</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{row.period}</td>
                      <td className="px-4 py-3 text-right text-green-600">฿{formatCurrency(row.totalRevenue)}</td>
                      <td className="px-4 py-3 text-right text-red-600">฿{formatCurrency(row.totalExpenses)}</td>
                      <td className={`px-4 py-3 text-right font-bold ${row.netProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
                        ฿{formatCurrency(row.netProfit)}
                      </td>
                      <td className="px-4 py-3 text-center">{row.transactionCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
