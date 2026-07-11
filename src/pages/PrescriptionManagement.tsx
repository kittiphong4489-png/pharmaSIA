import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../lib/api";

const getAuthHeaders = () => {
  const token = localStorage.getItem("pharma_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

interface Prescription {
  id: number;
  orderId: number;
  imageUrl: string;
  status: string;
  pharmacistName: string;
  notes: string;
  reviewedBy: number | null;
  reviewedAt: string | null;
  createdAt: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  orderStatus: string;
}

export default function PrescriptionManagement() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState<number | null>(null);

  const fetchPrescriptions = async () => {
    setLoading(true);
    try {
      const data = await apiClient(`/api/admin/prescriptions?status=${filter}`);
      setPrescriptions(data.prescriptions || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchPrescriptions(); }, [filter]);

  const handleApprove = async (id: number) => {
    if (!confirm("ยืนยันอนุมัติใบสั่งยานี้?")) return;
    try {
      await apiClient(`/api/admin/prescriptions/${id}/approve`, { method: "PUT" });
      fetchPrescriptions();
    } catch {}
  };

  const handleReject = async (id: number) => {
    const reason = prompt("ระบุเหตุผลที่ไม่อนุมัติ:");
    if (!reason) return;
    try {
      await apiClient(`/api/admin/prescriptions/${id}/reject`, {
        method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      fetchPrescriptions();
    } catch {}
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">📄 ใบสั่งยา</h1>
          <p className="text-sm text-gray-500">จัดการใบสั่งยาที่รอตรวจสอบ</p>
        </div>
        <Link to="/seller" className="text-sm text-blue-600 hover:text-blue-800">← กลับหลังร้าน</Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { key: "pending", label: "⏳ รอตรวจสอบ", color: "amber" },
          { key: "approved", label: "✅ อนุมัติแล้ว", color: "green" },
          { key: "rejected", label: "❌ ไม่อนุมัติ", color: "red" },
          { key: "", label: "ทั้งหมด", color: "gray" },
        ].map((tab) => (
          <button key={tab.key} onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === tab.key
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-gray-600 border border-gray-200 hover:border-blue-200 hover:text-blue-600"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="text-5xl mb-4">📄</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">ไม่มีใบสั่งยา</h2>
          <p className="text-gray-500">ไม่พบใบสั่งยาในสถานะนี้</p>
        </div>
      ) : (
        <div className="space-y-4">
          {prescriptions.map((pres) => (
            <div key={pres.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900">#{pres.orderNumber}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      pres.status === "pending" ? "bg-amber-100 text-amber-700" :
                      pres.status === "approved" ? "bg-green-100 text-green-700" :
                      "bg-red-100 text-red-700"
                    }`}>
                      {pres.status === "pending" ? "⏳ รอตรวจสอบ" : pres.status === "approved" ? "✅ อนุมัติ" : "❌ ไม่อนุมัติ"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">👤 {pres.customerName} {pres.customerPhone ? `📞 ${pres.customerPhone}` : ""}</p>
                  <p className="text-xs text-gray-400">📅 {pres.createdAt}</p>
                  {pres.notes && <p className="text-xs text-gray-500 mt-1">📝 {pres.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {pres.status === "pending" && (
                    <>
                      <button onClick={() => handleApprove(pres.id)}
                        className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-all">
                        ✅ อนุมัติ
                      </button>
                      <button onClick={() => handleReject(pres.id)}
                        className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-all">
                        ❌ ไม่อนุมัติ
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Prescription Image */}
              {pres.imageUrl && (
                <div className="mt-3">
                  <img
                    src={pres.imageUrl}
                    alt="ใบสั่งยา"
                    className="max-h-48 rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setSelectedImage(pres.imageUrl)}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              )}

              {/* Link to order */}
              <div className="mt-3 pt-3 border-t border-gray-100">
                <Link to={`/seller/orders`}
                  className="text-xs text-blue-600 hover:text-blue-800">
                  ดูออเดอร์ →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}>
          <div className="max-w-2xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img src={selectedImage} alt="ใบสั่งยา"
              className="w-full h-auto rounded-xl shadow-2xl" />
            <button onClick={() => setSelectedImage(null)}
              className="mt-3 px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100 mx-auto block">
              ปิด
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
