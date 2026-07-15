import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { Link } from "react-router-dom";

interface AdminUser {
  id: number; fullName: string; email: string; role: string; phone: string; isActive: number; createdAt: string;
}

const ROLE_OPTIONS = [
  { value: "SUPER_ADMIN", label: "SuperAdmin", desc: "เข้าถึงทุกอย่าง" },
  { value: "SELLER", label: "Manager", desc: "ดูแลสต็อก ราคา และออเดอร์" },
  { value: "ADMIN", label: "Staff", desc: "ดูแลเฉพาะออเดอร์และแพ็คของ" },
];

export default function AdminUserManagementPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ fullName: "", email: "", password: "", phone: "", role: "SELLER" });
  const [msg, setMsg] = useState("");

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
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: newRole }),
      });
      if (data.success) { setMsg("✅ เปลี่ยนสิทธิ์แล้ว"); loadAdmins(); }
      else alert("❌ " + (data.error || "Error"));
    } catch { alert("เกิดข้อผิดพลาด"); }
  };

  const deleteAdmin = async (id: number, name: string) => {
    if (!confirm(`ยืนยันลบ "${name}" ออกจากผู้ดูแลระบบ?`)) return;
    try {
      const data = await apiClient(`/api/admin/users/${id}`, { method: "DELETE" });
      if (data.success) { setMsg("✅ ลบแล้ว"); loadAdmins(); }
      else alert("❌ " + (data.error || "Error"));
    } catch { alert("เกิดข้อผิดพลาด"); }
  };

  const addAdmin = async () => {
    if (!addForm.fullName || !addForm.email || !addForm.password) { alert("กรุณากรอกข้อมูลให้ครบ"); return; }
    try {
      const data = await apiClient("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(addForm),
      });
      if (data.success) { setShowAdd(false); setAddForm({ fullName: "", email: "", password: "", phone: "", role: "SELLER" }); setMsg("✅ เพิ่มผู้ดูแลแล้ว"); loadAdmins(); }
      else alert("❌ " + (data.error || "Error"));
    } catch { alert("เกิดข้อผิดพลาด"); }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">👥 จัดการผู้ดูแลระบบ</h1>
          <p className="text-sm text-gray-500">เพิ่ม, ลบ, กำหนดสิทธิ์ Admin / Manager / Staff</p>
        </div>
        <div className="flex gap-2">
          <Link to="/seller" className="text-sm text-blue-600 hover:underline self-center">← กลับแดชบอร์ด</Link>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 font-medium">
            ➕ เพิ่ม Admin
          </button>
        </div>
      </div>

      {msg && <div className="mb-4 p-3 rounded-lg text-sm bg-blue-50 border border-blue-200 text-blue-700">{msg}</div>}

      {loading ? (
        <div className="text-center py-8 text-gray-400">กำลังโหลด...</div>
      ) : admins.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <div className="text-4xl mb-2">👥</div>
          <p className="text-gray-400">ไม่มีผู้ดูแลระบบ</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div class="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">ชื่อ</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">อีเมล</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Role</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">สถานะ</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">จัดการ</th>
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
                      {ROLE_OPTIONS.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
                    </select>
                    <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      u.role === "SUPER_ADMIN" ? "bg-purple-100 text-purple-700" :
                      u.role === "SELLER" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                    }`}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs ${u.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => deleteAdmin(u.id, u.fullName)}
                      className="px-3 py-1 bg-red-50 text-red-600 rounded text-xs hover:bg-red-100">
                      🗑️ ลบ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Admin Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">เพิ่มผู้ดูแลระบบ</h2>
            <div className="space-y-3">
              <input placeholder="ชื่อ-สกุล" value={addForm.fullName} onChange={(e) => setAddForm({...addForm, fullName: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
              <input placeholder="อีเมล" type="email" value={addForm.email} onChange={(e) => setAddForm({...addForm, email: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
              <input placeholder="รหัสผ่าน" type="password" value={addForm.password} onChange={(e) => setAddForm({...addForm, password: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
              <input placeholder="เบอร์โทร (ไม่บังคับ)" value={addForm.phone} onChange={(e) => setAddForm({...addForm, phone: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
              <select value={addForm.role} onChange={(e) => setAddForm({...addForm, role: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg text-sm">
                {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
              </select>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={addAdmin} className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700">✅ เพิ่ม</button>
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 bg-gray-100 rounded-xl font-medium hover:bg-gray-200">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* Role description */}
      <div className="mt-8 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-5 border border-blue-100">
        <h3 className="font-semibold text-gray-800 mb-3 text-sm">🔐 คำอธิบายสิทธิ์ (Role)</h3>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          {ROLE_OPTIONS.map((r) => (
            <div key={r.value} className="bg-white rounded-lg p-3 border border-gray-100">
              <p className={`font-bold text-sm ${r.value === "SUPER_ADMIN" ? "text-purple-700" : r.value === "SELLER" ? "text-blue-700" : "text-gray-700"}`}>{r.label}</p>
              <p className="text-xs text-gray-500 mt-1">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
