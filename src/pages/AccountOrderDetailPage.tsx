/**
 * src/pages/AccountOrderDetailPage.tsx
 * ดูรายละเอียดออเดอร์ + จ่ายต่อ (ถ้ายังไม่จ่าย)
 */
import React, { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { apiClient, getAuthToken } from "../lib/api";
import PaymentFlow from "../components/PaymentFlow";

export default function AccountOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [payment, setPayment] = useState<any>(null);
  const [slipConfirmed, setSlipConfirmed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = getAuthToken();
        const res = await fetch(`/api/orders/${id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error("Load failed");
        const data = await res.json();
        setOrder(data);

        // Check if already paid
        if (data.status === "paid" || data.status === "confirmed" ||
            data.status === "packing" || data.status === "packed" ||
            data.status === "shipping" || data.status === "delivered") {
          setSlipConfirmed(true);
        }
      } catch (e: any) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const createPayment = useCallback(async () => {
    try {
      const data = await apiClient("/api/payments/create", {
        method: "POST",
        body: JSON.stringify({ orderId: Number(id) }),
      });
      // Try to get payment from different response formats
      const payData = data.payment || data;
      setPayment(payData);
      return payData;
    } catch (e: any) {
      console.error("สร้าง Payment ไม่สำเร็จ:", e);
      return null;
    }
  }, [id]);

  const statusLabels: Record<string, string> = {
    pending: "รอจ่ายเงิน", paid: "จ่ายแล้ว", confirmed: "รออนุมัติ",
    packing: "กำลังแพ็ค", packed: "รอเข้ารับ", shipping: "กำลังจัดส่ง",
    cancelled: "ยกเลิก", delivered: "ส่งสำเร็จ",
  };
  const statusColors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700", paid: "bg-green-100 text-green-700",
    confirmed: "bg-blue-100 text-blue-700", packing: "bg-purple-100 text-purple-700",
    packed: "bg-indigo-100 text-indigo-700", shipping: "bg-cyan-100 text-cyan-700",
    cancelled: "bg-red-100 text-red-700", delivered: "bg-green-100 text-green-700",
  };

  if (loading) return <div className="max-w-lg mx-auto px-4 py-16 text-center text-gray-500">⏳ กำลังโหลด...</div>;
  if (!order) return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <h2 className="text-xl font-bold text-gray-900 mb-4">ไม่พบออเดอร์</h2>
      <Link to="/account/orders" className="text-blue-600 underline">กลับไปหน้าออเดอร์</Link>
    </div>
  );

  // If unpaid, show payment flow
  if (order.status === "pending") {
    return (
      <div>
        <div className="max-w-lg mx-auto px-4 pt-4">
          <Link to="/account/orders" className="text-sm text-blue-600 hover:underline">← กลับไปหน้าออเดอร์</Link>
        </div>
        <PaymentFlow
          orderId={order.id}
          orderNumber={order.orderNumber}
          grandTotal={order.grandTotal}
          createPayment={createPayment}
          payment={payment}
          slipConfirmed={slipConfirmed}
          onPaymentDone={() => {
            setSlipConfirmed(true);
            setOrder({ ...order, status: "paid" });
          }}
        />
      </div>
    );
  }

  // Paid order - show details
  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <Link to="/account/orders" className="text-sm text-blue-600 hover:underline">← กลับไปหน้าออเดอร์</Link>
      <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{order.orderNumber}</h2>
            <p className="text-sm text-gray-500">
              {new Date(order.orderedAt || order.createdAt).toLocaleDateString("th-TH")}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[order.status] || ""}`}>
            {statusLabels[order.status] || order.status}
          </span>
        </div>
        {slipConfirmed && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-center">
            <p className="text-green-700 font-semibold">✅ ยืนยันการชำระเงินเรียบร้อย!</p>
            <p className="text-xs text-green-600 mt-1">เจ้าหน้าที่จะตรวจสอบและดำเนินการจัดส่งโดยเร็ว</p>
          </div>
        )}
        {order.trackingNumber && (
          <p className="text-sm mt-2"><span className="text-gray-500">เลขพัสดุ:</span> <span className="font-mono font-semibold">{order.trackingNumber}</span></p>
        )}
      </div>
    </div>
  );
}
