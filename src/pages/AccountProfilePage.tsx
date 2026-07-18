import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { User, Mail, Phone, MapPin, Home, Building, Plus, X, Save, Key, Edit2, Trash2, Check, AlertCircle } from "lucide-react";
import { apiClient } from "../lib/api";

export default function AccountProfilePage() {
  const { user } = useAuth();
  const [showAddress, setShowAddress] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [newAddr, setNewAddr] = useState({ fullName: "", label: "บ้าน", address: "", district: "", province: "", zip: "", phone: "", isDefault: false });
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null);
  const [editAddr, setEditAddr] = useState<any>(null);
  const [addressMsg, setAddressMsg] = useState("");

  // Edit profile state
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ fullName: "", phone: "" });
  const [profileMsg, setProfileMsg] = useState("");

  const [pw, setPw] = useState({ current: "", newPw: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState("");

  // Fetch existing addresses on mount
  useEffect(() => {
    const token = localStorage.getItem("pharma_token");
    if (token) {
      apiClient("/api/account/addresses")
        .then(d => setAddresses(d.addresses || [])).catch(() => {});
    }
  }, []);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("pharma_token");
    return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
  };

  const saveAddress = async () => {
    if (!newAddr.address.trim()) { setAddressMsg("❌ กรุณากรอกที่อยู่"); return; }
    const r = await apiClient("/api/account/addresses", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(newAddr),
    });
    const d = await r.json();
    if (d.success) { setAddresses(prev => [...prev, d.address]); setShowAddress(false); setAddressMsg("✅ เพิ่มที่อยู่สำเร็จ"); }
    else { setAddressMsg("❌ " + (d.error || "ไม่สามารถเพิ่มที่อยู่ได้")); }
    setNewAddr({ fullName: "", label: "บ้าน", address: "", district: "", province: "", zip: "", phone: "", isDefault: false });
    setTimeout(() => setAddressMsg(""), 3000);
  };

  const deleteAddress = async (id: number) => {
    if (!confirm("ลบที่อยู่นี้?")) return;
    const token = localStorage.getItem("pharma_token");
    await apiClient(`/api/account/addresses/${id}`, {
      method: "DELETE",
    });
    setAddresses(prev => prev.filter(a => a.id !== id));
    setAddressMsg("✅ ลบที่อยู่สำเร็จ");
    setTimeout(() => setAddressMsg(""), 3000);
  };

  const startEditAddress = (addr: any) => {
    setEditingAddressId(addr.id);
    setEditAddr({ ...addr });
  };

  const saveEditAddress = async () => {
    if (!editAddr) return;
    const token = localStorage.getItem("pharma_token");
    await apiClient(`/api/account/addresses/${editAddr.id}`, {
      method: "PUT",
      body: JSON.stringify(editAddr),
    });
    setAddresses(prev => prev.map(a => a.id === editAddr.id ? editAddr : a));
    setEditingAddressId(null);
    setEditAddr(null);
    setAddressMsg("✅ แก้ไขที่อยู่สำเร็จ");
    setTimeout(() => setAddressMsg(""), 3000);
  };

  const startEditProfile = () => {
    setProfileForm({ fullName: user?.fullName || "", phone: user?.phone || "" });
    setEditingProfile(true);
  };

  const saveProfile = async () => {
    const token = localStorage.getItem("pharma_token");
    try {
      const r = await apiClient("/api/account/profile", {
        method: "PUT",
        body: JSON.stringify(profileForm),
      });
      const d = await r.json();
      if (d.success) {
        setProfileMsg("✅ อัปเดตข้อมูลสำเร็จ");
        setEditingProfile(false);
        // Update local state instead of full reload
        if (user) {
          user.fullName = profileForm.fullName;
          user.phone = profileForm.phone;
        }
      } else {
        setProfileMsg("❌ " + (d.error || "ไม่สามารถอัปเดตข้อมูลได้"));
      }
    } catch {
      setProfileMsg("❌ เกิดข้อผิดพลาด");
    }
    setTimeout(() => setProfileMsg(""), 3000);
  };

  const changePassword = async () => {
    if (pw.newPw !== pw.confirm) { setPwMsg("รหัสผ่านไม่ตรงกัน"); return; }
    if (pw.newPw.length < 6) { setPwMsg("รหัสผ่านต้องมีอย่างน้อย 6 ตัว"); return; }
    const token = localStorage.getItem("pharma_token");
    const r = await apiClient("/api/account/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.newPw }),
    });
    const d = await r.json();
    setPwMsg(d.success ? "✅ เปลี่ยนรหัสผ่านสำเร็จ" : `❌ ${d.error}`);
    if (d.success) { setPw({ current: "", newPw: "", confirm: "" }); }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">บัญชีของฉัน</h1>

      {/* Global messages */}
      {addressMsg && (
        <div className="mb-4 p-3 rounded-lg text-sm flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700">
          {addressMsg}
        </div>
      )}

      {/* Profile Info */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><User className="w-5 h-5 text-blue-500" /> ข้อมูลส่วนตัว</h2>
          <button onClick={startEditProfile} className="text-sm text-blue-600 font-medium hover:underline flex items-center gap-1">
            <Edit2 className="w-4 h-4" /> แก้ไข
          </button>
        </div>
        {editingProfile ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">ชื่อ-นามสกุล</label>
              <input value={profileForm.fullName} onChange={e => setProfileForm({ ...profileForm, fullName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">เบอร์โทรศัพท์</label>
              <input value={profileForm.phone} onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" placeholder="088-XXX-XXXX" />
            </div>
            {profileMsg && <p className={`text-sm ${profileMsg.includes("✅") ? "text-green-600" : "text-red-600"}`}>{profileMsg}</p>}
            <div className="flex gap-2">
              <button onClick={saveProfile} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-all">บันทึก</button>
              <button onClick={() => setEditingProfile(false)} className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200 transition-all">ยกเลิก</button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center gap-2"><User className="w-4 h-4 text-gray-400" /> {user?.fullName || "-"}</div>
            <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" /> {user?.email || "-"}</div>
            <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /> {user?.phone || "-"}</div>
          </div>
        )}
      </div>

      {/* Addresses */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><MapPin className="w-5 h-5 text-blue-500" /> ที่อยู่จัดส่ง</h2>
          <button onClick={() => setShowAddress(true)} className="text-sm text-blue-600 font-medium hover:underline flex items-center gap-1">
            <Plus className="w-4 h-4" /> เพิ่มที่อยู่
          </button>
        </div>
        {addresses.length === 0 && <p className="text-sm text-gray-400">ยังไม่มีที่อยู่จัดส่ง</p>}
        {addresses.map((a, i) => (
          editingAddressId === a.id ? (
            <div key={a.id} className="border border-blue-200 rounded-lg p-3 mb-2 bg-blue-50">
              <div className="space-y-2">
                <select value={editAddr?.label || "บ้าน"} onChange={e => setEditAddr({...editAddr, label: e.target.value})}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm">
                  <option value="บ้าน">บ้าน</option>
                  <option value="ที่ทำงาน">ที่ทำงาน</option>
                  <option value="ร้านค้า">ร้านค้า</option>
                </select>
                <textarea value={editAddr?.address || ""} onChange={e => setEditAddr({...editAddr, address: e.target.value})}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm" rows={2} />
                <div className="grid grid-cols-2 gap-2">
                  <input value={editAddr?.district || ""} onChange={e => setEditAddr({...editAddr, district: e.target.value})}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm" placeholder="เขต/อำเภอ" />
                  <input value={editAddr?.province || ""} onChange={e => setEditAddr({...editAddr, province: e.target.value})}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm" placeholder="จังหวัด" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input value={editAddr?.zip || ""} onChange={e => setEditAddr({...editAddr, zip: e.target.value})}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm" placeholder="รหัสไปรษณีย์" />
                  <input value={editAddr?.phone || ""} onChange={e => setEditAddr({...editAddr, phone: e.target.value})}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm" placeholder="เบอร์โทร" />
                </div>
                <div className="flex gap-2">
                  <button onClick={saveEditAddress} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">💾 บันทึก</button>
                  <button onClick={() => { setEditingAddressId(null); setEditAddr(null); }} className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200">ยกเลิก</button>
                </div>
              </div>
            </div>
          ) : (
            <div key={a.id || i} className="border border-gray-100 rounded-lg p-3 mb-2 group hover:border-gray-200 transition-all">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {a.label === "ร้านค้า" ? <Building className="w-4 h-4 text-blue-500" /> : <Home className="w-4 h-4 text-green-500" />}
                  <span className="font-medium text-sm">{a.label}</span>
                  {a.isDefault && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">ค่าเริ่มต้น</span>}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => startEditAddress(a)} className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteAddress(a.id)} className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-500">{a.address}</p>
              {(a.district || a.province) && <p className="text-xs text-gray-400">{a.district} {a.province} {a.zip}</p>}
              <p className="text-xs text-gray-400 mt-1">{a.phone}</p>
            </div>
          )
        ))}
        {showAddress && (
          <div className="border border-blue-100 rounded-lg p-4 bg-blue-50 mt-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm">เพิ่มที่อยู่ใหม่</h3>
              <button onClick={() => setShowAddress(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <input value={newAddr.fullName} onChange={e => setNewAddr({...newAddr, fullName: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="ชื่อ-นามสกุลผู้รับ" />
              <select value={newAddr.label} onChange={e => setNewAddr({...newAddr, label: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                <option value="บ้าน">บ้าน</option>
                <option value="ที่ทำงาน">ที่ทำงาน</option>
                <option value="ร้านค้า">ร้านค้า</option>
              </select>
              <textarea value={newAddr.address} onChange={e => setNewAddr({...newAddr, address: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" rows={3} placeholder="ที่อยู่" />
              <div className="grid grid-cols-2 gap-2">
                <input value={newAddr.district} onChange={e => setNewAddr({...newAddr, district: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="เขต/อำเภอ" />
                <input value={newAddr.province} onChange={e => setNewAddr({...newAddr, province: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="จังหวัด" />
              </div>
              <input value={newAddr.zip} onChange={e => setNewAddr({...newAddr, zip: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="รหัสไปรษณีย์" />
              <input type="tel" value={newAddr.phone} onChange={e => setNewAddr({...newAddr, phone: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="เบอร์โทร" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newAddr.isDefault} onChange={e => setNewAddr({...newAddr, isDefault: e.target.checked})} /> ตั้งเป็นค่าเริ่มต้น</label>
              <button onClick={saveAddress} className="w-full py-2 bg-blue-600 text-white font-medium rounded-lg text-sm hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                <Save className="w-4 h-4" /> บันทึก
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Change Password */}
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <button onClick={() => setShowPassword(!showPassword)} className="flex items-center justify-between w-full">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Key className="w-5 h-5 text-blue-500" /> เปลี่ยนรหัสผ่าน</h2>
          <span className="text-gray-400">{showPassword ? "▲" : "▼"}</span>
        </button>
        {showPassword && (
          <div className="space-y-3 mt-4">
            <input type="password" value={pw.current} onChange={e => setPw({...pw, current: e.target.value})}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="รหัสผ่านปัจจุบัน" />
            <input type="password" value={pw.newPw} onChange={e => setPw({...pw, newPw: e.target.value})}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="รหัสผ่านใหม่" />
            <input type="password" value={pw.confirm} onChange={e => setPw({...pw, confirm: e.target.value})}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="ยืนยันรหัสผ่านใหม่" />
            {pwMsg && <p className={`text-sm ${pwMsg.includes("✅") ? "text-green-600" : "text-red-600"}`}>{pwMsg}</p>}
            <button onClick={changePassword}
              className="w-full py-2 bg-blue-600 text-white font-medium rounded-lg text-sm hover:bg-blue-700 transition-all">
              เปลี่ยนรหัสผ่าน
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
