import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiClient } from "../lib/api";

interface Customer {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  customerCode: string | null;
  rawPassword: string;
  role: string;
  tier: string;
  isActive: number;
  createdAt: string;
  orderCount: number;
  totalSpent: number;
}

interface Order {
  id: number;
  orderNumber: string;
  grandTotal: number;
  status: string;
  orderedAt: string;
  itemCount: number;
  itemsTotal: number;
}

const getAuthHeaders = () => {
  const token = localStorage.getItem("pharma_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-amber-600 bg-amber-50",
  paid: "text-blue-600 bg-blue-50",
  confirmed: "text-indigo-600 bg-indigo-50",
  shipping: "text-purple-600 bg-purple-50",
  delivered: "text-green-600 bg-green-50",
  cancelled: "text-red-600 bg-red-50",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "รอจ่ายเงิน",
  paid: "จ่ายแล้ว",
  confirmed: "รออนุมัติ",
  packing: "กำลังแพ็ค",
  packed: "รอพนักงานเข้ารับ",
  shipping: "กำลังจัดส่ง",
  delivered: "ส่งสำเร็จ",
  cancelled: "ยกเลิก",
};

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Password change modal state
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdMessage, setPwdMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchCustomer = () => {
    if (!id) return;
    setLoading(true);
    apiClient(`/api/admin/customers/${id}`)
      
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setCustomer(data.customer);
          setOrders(data.orders || []);
        }
        setLoading(false);
      })
      .catch((e) => {
        setError(e?.message || "Error");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchCustomer();
  }, [id]);

  const handleChangePassword = async () => {
    setPwdMessage(null);
    if (newPassword.length < 6) {
      setPwdMessage({ type: "error", text: "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdMessage({ type: "error", text: "รหัสผ่านทั้งสองช่องไม่ตรงกัน" });
      return;
    }
    setPwdLoading(true);
    try {
      const data = await apiClient(`/api/admin/customers/${customer.id}/password`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      if (data.success) {
        setPwdMessage({ type: "success", text: "✅ เปลี่ยนรหัสผ่านเรียบร้อย" });
        setNewPassword("");
        setConfirmPassword("");
        // Refresh customer data to show updated rawPassword
        fetchCustomer();
        setTimeout(() => setShowPwdModal(false), 1500);
      } else {
        setPwdMessage({ type: "error", text: data.error || "เกิดข้อผิดพลาด" });
      }
    } catch (e: any) {
      setPwdMessage({ type: "error", text: e?.message || "เกิดข้อผิดพลาด" });
    }
    setPwdLoading(false);
  };

  if (loading) return <div className="p-6 text-center text-gray-500">กำลังโหลด...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!customer) return <div className="p-6 text-gray-500">ไม่พบลูกค้า</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link to="/seller/customers" className="text-blue-600 hover:underline text-sm mb-4 inline-block">
        ← กลับไปหน้ารายการลูกค้า
      </Link>

      {/* Customer Profile */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h1 className="text-2xl font-bold mb-4">👤 รายละเอียดลูกค้า</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">ชื่อ:</span>
            <p className="font-medium">{customer.fullName}</p>
          </div>
          <div>
            <span className="text-gray-500">รหัสลูกค้า:</span>
            <p className="font-mono font-medium text-blue-600">{customer.customerCode || "-"}</p>
          </div>
          <div>
            <span className="text-gray-500">อีเมล:</span>
            <p>{customer.email || "-"}</p>
          </div>
          <div>
            <span className="text-gray-500">เบอร์โทร:</span>
            <p>{customer.phone || "-"}</p>
          </div>
          <div>
            <span className="text-gray-500">Tier:</span>
            <p>{customer.tier || "-"}</p>
          </div>
          <div>
            <span className="text-gray-500">สถานะ:</span>
            <p className={customer.isActive ? "text-green-600" : "text-red-600"}>
              {customer.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
            </p>
          </div>
          <div>
            <span className="text-gray-500">วันที่สมัคร:</span>
            <p>{customer.createdAt ? new Date(customer.createdAt).toLocaleDateString("th-TH") : "-"}</p>
          </div>
          <div>
            <span className="text-gray-500">จำนวนออเดอร์:</span>
            <p className="font-semibold">{orders.length} รายการ</p>
          </div>
        </div>
      </div>

      {/* Password Section (Admin only) */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-bold mb-3">🔑 รหัสผ่าน</h2>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <span className="text-gray-500 text-sm">รหัสผ่านปัจจุบัน:</span>
            <p className="font-mono text-base font-medium text-gray-800 mt-1">
              {customer.rawPassword ? (
                <span className="bg-yellow-50 px-3 py-1 rounded border border-yellow-200">
                  {customer.rawPassword}
                </span>
              ) : (
                <span className="text-gray-400 italic">ไม่มีข้อมูลรหัสผ่าน (อาจเป็น OAuth)</span>
              )}
            </p>
          </div>
          <button
            onClick={() => { setShowPwdModal(true); setPwdMessage(null); setNewPassword(""); setConfirmPassword(""); }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium whitespace-nowrap"
          >
            🔑 เปลี่ยนรหัสผ่าน
          </button>
        </div>
      </div>

      {/* Orders History */}
      <div className="bg-white rounded-xl shadow-sm border">
        <h2 className="px-4 py-3 font-semibold border-b">📋 ประวัติการสั่งซื้อ</h2>
        {orders.length === 0 ? (
          <div className="p-6 text-center text-gray-400">ไม่มีประวัติการสั่งซื้อ</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">ออเดอร์</th>
                <th className="px-4 py-2 text-left">วันที่</th>
                <th className="px-4 py-2 text-right">รายการ</th>
                <th className="px-4 py-2 text-right">ยอดรวม</th>
                <th className="px-4 py-2 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs">{o.orderNumber}</td>
                  <td className="px-4 py-2 text-xs">{o.orderedAt}</td>
                  <td className="px-4 py-2 text-right">{o.itemCount}</td>
                  <td className="px-4 py-2 text-right">฿{o.grandTotal?.toFixed(2)}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[o.status] || ""}`}>
                      {STATUS_LABELS[o.status] || o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Change Password Modal */}
      {showPwdModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">🔑 เปลี่ยนรหัสผ่านลูกค้า</h3>
            <p className="text-sm text-gray-500 mb-4">
              กำลังเปลี่ยนรหัสผ่านของ: <strong>{customer.fullName}</strong>
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่านใหม่</label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="รหัสผ่านอย่างน้อย 6 ตัวอักษร"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ยืนยันรหัสผ่าน</label>
                <input
                  type="text"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่านอีกครั้ง"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            {pwdMessage && (
              <div className={`mt-3 text-sm px-3 py-2 rounded ${
                pwdMessage.type === "success"
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}>
                {pwdMessage.text}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowPwdModal(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                disabled={pwdLoading}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleChangePassword}
                disabled={pwdLoading || !newPassword}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pwdLoading ? "กำลังเปลี่ยน..." : "✅ ยืนยันเปลี่ยนรหัสผ่าน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
