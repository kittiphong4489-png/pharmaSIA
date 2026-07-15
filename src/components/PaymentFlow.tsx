/**
 * src/components/PaymentFlow.tsx
 * Component แสดง QR PromptPay + อัปโหลดสลิป + ยืนยัน
 * ใช้ซ้ำได้ทั้ง CartPage (หลังสั่งซื้อ) และ AccountOrderDetail (จ่ายต่อ)
 */
import React, { useState, useRef } from "react";
import { apiClient, uploadSlipImage } from "../lib/api";

interface PaymentFlowProps {
  orderId: number;
  orderNumber: string;
  grandTotal: number;
  createPayment: () => Promise<any>;
  payment: any;
  slipConfirmed: boolean;
  onPaymentDone: () => void;
}

export default function PaymentFlow({
  orderId,
  orderNumber,
  grandTotal,
  createPayment,
  payment,
  slipConfirmed,
  onPaymentDone,
}: PaymentFlowProps) {
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipUrl, setSlipUrl] = useState<string>("");
  const [slipUploading, setSlipUploading] = useState(false);
  const slipInputRef = useRef<HTMLInputElement>(null);

  const handleSlipUpload = async (file: File) => {
    if (slipUploading) return;
    setSlipUploading(true);
    setSlipFile(file);
    try {
      const url = await uploadSlipImage(file);
      setSlipUrl(url);
    } catch {
      alert("อัปโหลดสลิปไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSlipUploading(false);
    }
  };

  const confirmPaymentWithSlip = async () => {
    if (!payment?.id || !slipUrl) return;
    try {
      await apiClient(`/api/payments/${payment.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({ slipUrl }),
      });
      onPaymentDone();
    } catch {
      alert("ยืนยันการชำระเงินไม่สำเร็จ");
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-8 text-center">
      {slipConfirmed ? (
        <>
          <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-6">✅</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">📋 สั่งซื้อสำเร็จ</h2>
          <p className="text-sm text-green-600 bg-green-50 rounded-lg p-3 mb-4">✅ ยืนยันการชำระเงินเรียบร้อยแล้ว</p>
        </>
      ) : (
        <>
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-6">⏳</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">📋 รอจ่ายเงิน</h2>
          <p className="text-sm text-amber-600 bg-amber-50 rounded-lg p-3 mb-4">⚠️ กรุณาชำระเงินและอัปโหลดสลิปเพื่อยืนยัน</p>
        </>
      )}

      <p className="text-gray-500 mb-1">
        เลขที่ออเดอร์: <span className="font-mono font-bold text-blue-600">{orderNumber}</span>
      </p>
      <p className="text-gray-500 mb-6">
        ยอดรวม: <span className="font-bold text-lg">฿{grandTotal?.toFixed(2)}</span>
      </p>

      {!payment && !slipConfirmed && (
        <button onClick={createPayment}
          className="w-full mb-4 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-all">
          💳 ชำระด้วย QR PromptPay
        </button>
      )}

      {payment && !slipConfirmed && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 text-center">
          <h3 className="font-bold text-gray-900 mb-1">💳 ชำระเงินด้วย PromptPay</h3>
          <p className="text-sm text-gray-500 mb-4">
            กรุณาชำระเงิน <strong>฿{payment.amount?.toFixed(2)}</strong> โดยสแกน QR ด้านล่าง
          </p>
          <div className="flex justify-center">
            <div className="relative inline-flex">
              <img src="/api/images/qr-promptpay.jpg" alt="PromptPay QR"
                className="w-56 h-56 rounded-xl shadow-md border-2 border-gray-100" />
              <a href="/api/images/qr-promptpay.jpg" download="PharmaSIA-promptpay.jpg"
                className="absolute top-2 right-2 w-7 h-7 bg-white/90 backdrop-blur-sm rounded-full shadow flex items-center justify-center text-blue-600 hover:bg-white border border-gray-200 cursor-pointer text-xs"
                title="ดาวน์โหลด QR Code">⬇</a>
            </div>
          </div>
          <div className="text-sm text-gray-600 space-y-1 mt-4 bg-blue-50 rounded-xl p-4 text-center max-w-xs mx-auto">
            <p className="font-semibold text-gray-900">PharmaSIA</p>
            <p>PromptPay: <span className="font-mono font-bold">075-3600-031</span></p>
            <p className="text-xl font-bold text-blue-600">฿{payment.amount?.toFixed(2)}</p>
          </div>

          <div className="mt-6 border-t border-gray-100 pt-4">
            <h4 className="font-semibold text-gray-900 mb-2 text-sm">📎 อัปโหลดสลิปโอนเงิน</h4>
            <p className="text-xs text-gray-500 mb-3">หลังจากโอนเงินแล้ว กรุณาอัปโหลดสลิปเพื่อยืนยัน</p>
            <input ref={slipInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleSlipUpload(f); }} />
            <button onClick={() => slipInputRef.current?.click()}
              disabled={slipUploading}
              className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-all disabled:opacity-50">
              {slipUploading ? "⏳ กำลังอัปโหลด..." : slipFile ? "✅ " + slipFile.name : "📷 เลือกรูปสลิป"}
            </button>
            {slipUrl && (
              <div className="mt-3">
                <img src={slipUrl} alt="สลิปโอนเงิน" className="w-32 h-32 mx-auto rounded-lg border border-gray-200 object-cover" />
              </div>
            )}
            <button onClick={confirmPaymentWithSlip}
              disabled={!slipUrl}
              className="w-full mt-3 py-2.5 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              ✅ ยืนยันการชำระเงิน
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
