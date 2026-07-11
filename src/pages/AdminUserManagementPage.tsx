import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { Link } from "react-router-dom";

interface AdminUser {
  id: number;
  fullName: string;
  email: string;
  role: string;
  phone: string;
  isActive: number;
  createdAt: string;
}

const ROLE_OPTIONS = [
  { value: "SUPER_ADMIN", label: "SuperAdmin", desc: "เข้าถึงทุกอย่าง" },
  { value: "SELLER", label: "Manager", desc: "ดูแลสต็อก ราคา และออเดอร์" },
  { value: "ADMIN", label: "Staff", desc: "ดูแลเฉพาะออเดอร์และแพ็คของ" },
];

export default function AdminUserManagementPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAdmins = () => {
    setLoading(true);
    apiClient("/api/admin/users")
      .then(d => { setAdmins(d.users || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadAdmins(); }, []);

  const updateRole = async (userId: number, newRole: string) => {
    if (!confirm(`เปลี่ยน Role เป็น ${ROLE_OPTIONS.find(r => r.value === newRole)?.label}?`)) return;
    try {
      const data = await apiClient(`/api/admin/users/${userId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: newRole }),
      });
      if (data.success) loadAdmins();
      else alert("❌ " + (data.error || "Error"));
    } catch { alert("เกิดข้อผิดพลาด"); }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">👥 จัดการผู้ดูแลระบบ</h1>
          <p className="text-sm text-gray-500">กำหนดสิทธิ์ Admin, Manager, Staff</p>
        </div>
        <Link to="/seller" className="text-sm text-blue-600 hover:underline">← กลับแดชบอร์ด</Link>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">กำลังโหลด...</div>
      ) : admins.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <div className="text-4xl mb-2">👥</div>
          <p className="text-gray-400">ไม่มีผู้ดูแลระบบ</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">ชื่อ</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">อีเมล</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Role</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">สถานะ</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">วันที่สร้าง</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((u) => (
                <tr key={u.id} className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium">{u.fullName}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{u.email}</td>
                  <td className="px-4 py-3 text-center">
                    <select value={u.role} onChange={(e) => updateRole(u.id, e.target.value)}
                      className="px-2 py-1 rounded-lg border border-gray-200 text-xs font-medium">
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    {u.role && (
                      <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        u.role === "SUPER_ADMIN" ? "bg-purple-100 text-purple-700" :
                        u.role === "SELLER" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                      }`}>
                        {u.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs ${u.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-500">
                    {new Date(u.createdAt).toLocaleDateString("th-TH")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Role description */}
      <div className="mt-8 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-5 border border-blue-100">
        <h3 className="font-semibold text-gray-800 mb-3 text-sm">🔐 คำอธิบายสิทธิ์ (Role)</h3>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          {ROLE_OPTIONS.map((r) => (
            <div key={r.value} className="bg-white rounded-lg p-3 border border-gray-100">
              <p className={`font-bold text-sm ${
                r.value === "SUPER_ADMIN" ? "text-purple-700" : r.value === "SELLER" ? "text-blue-700" : "text-gray-700"
              }`}>{r.label}</p>
              <p className="text-xs text-gray-500 mt-1">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
