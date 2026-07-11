import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../lib/api";

interface SlipItem {
  id: number;
  slipId: number;
  orderItemId: number;
  batchId: number | null;
  lotNumber: string | null;
  expiryDate: string | null;
  quantity: number;
  verified: number;
  productNameTh: string;
  productNameEn: string;
  unitPrice: number;
  orderedQty: number;
  productSku: string;
  productImage: string | null;
}

interface PackingSlip {
  id: number;
  orderId: number;
  slipNumber: string;
  packedBy: number;
  status: string;
  notes: string | null;
  createdAt: string;
  packedAt: string | null;
  verifiedAt: string | null;
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  shippingAddressJson: string;
  subtotal: number;
  shippingFee: number;
  grandTotal: number;
  orderedAt: string;
  orderStatus: string;
}

interface StoreSettings {
  storeName: string;
  storeNameTh: string;
  storeAddress: string;
  storePhone: string;
  storeEmail: string;
  taxId: string;
  footer: string;
  [key: string]: string;
}

export default function PackingDetailPage() {
  const { slipId } = useParams<{ slipId: string }>();
  const navigate = useNavigate();
  const [slip, setSlip] = useState<PackingSlip | null>(null);
  const [items, setItems] = useState<SlipItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [settings, setSettings] = useState<StoreSettings | null>(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("pharma_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadSlip = () => {
    if (!slipId) return;
    setLoading(true);
    apiClient(`/api/packing/slip/${slipId}`)
      
      .then((data) => {
        setSlip(data.slip);
        setItems(data.items || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadSlip(); }, [slipId]);

  // Load store settings for print
  useEffect(() => {
    apiClient("/api/seller/settings")
      
      .then((data) => {
        if (data.settings) setSettings(data.settings);
      })
      .catch(() => {});
  }, []);

  const toggleVerify = async (itemId: number, currentVerified: number) => {
    await apiClient(`/api/packing/verify/${itemId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ verified: !currentVerified }),
    });
    loadSlip();
  };

  const completePacking = async () => {
    if (!slipId || !confirm("ยืนยันแพ็คเสร็จสิ้น?")) return;
    if (verifiedCount < items.length) {
      alert(`⚠️ ยังตรวจสอบไม่ครบ (${verifiedCount}/${items.length} รายการ) กรุณาตรวจสอบให้ครบก่อนเสร็จสิ้น`);
      return;
    }
    setCompleting(true);
    await apiClient(`/api/packing/complete/${slipId}`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
    setCompleting(false);
    navigate("/seller/orders");
  };

  const handlePrint = () => {
    window.print();
  };

  const verifiedCount = items.filter((i) => i.verified).length;
  const shippingAddress = slip?.shippingAddressJson
    ? (() => {
        try {
          const addr = JSON.parse(slip.shippingAddressJson);
          return typeof addr === "string"
            ? addr
            : [addr.address, addr.district, addr.province, addr.zip]
                .filter(Boolean)
                .join(" ");
        } catch {
          return slip.shippingAddressJson;
        }
      })()
    : "";

  const storeName = settings?.storeNameTh || settings?.storeName || "PharmaCare";
  const storeAddr = settings?.storeAddress || "";
  const storePhone = settings?.storePhone || "";
  const storeTaxId = settings?.taxId || "";
  const printFooter = settings?.footer || "ขอบคุณที่ใช้บริการ";

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center py-16 text-gray-400">กำลังโหลด...</div>
      </div>
    );
  }

  if (!slip) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center py-16 text-gray-400">ไม่พบข้อมูล</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 no-print">
        <div>
          <button
            onClick={() => navigate("/seller/orders")}
            className="text-sm text-blue-600 hover:text-blue-700 mb-2 inline-block"
          >
            ← กลับไปรายการออเดอร์
          </button>
          <h1 className="text-xl font-bold text-gray-900">
            แพ็คสินค้า — {slip.orderNumber}
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
          >
            🖨️ พิมพ์
          </button>
          <button
            onClick={completePacking}
            disabled={completing}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
          >
            {completing ? "กำลังดำเนินการ..." : "✅ เสร็จสิ้นแพ็ค"}
          </button>
        </div>
      </div>

      {/* Packing slip info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-400">เลขที่ใบแพ็ค</p>
            <p className="text-sm font-mono font-bold text-gray-900">{slip.slipNumber}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">วันที่สั่งซื้อ</p>
            <p className="text-sm text-gray-700">
              {new Date(slip.orderedAt).toLocaleString("th-TH")}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">ชื่อลูกค้า</p>
            <p className="text-sm font-medium text-gray-900">{slip.customerName}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">เบอร์โทร</p>
            <p className="text-sm text-gray-700">{slip.customerPhone || "-"}</p>
          </div>
        </div>
        {shippingAddress && (
          <div className="mt-3">
            <p className="text-xs text-gray-400">ที่อยู่จัดส่ง</p>
            <p className="text-sm text-gray-700">{shippingAddress}</p>
          </div>
        )}
        <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
          <span className="text-sm text-gray-500">ยอดรวม: <strong className="text-blue-600">฿{slip.grandTotal.toFixed(2)}</strong></span>
          <span className="text-sm text-gray-500">ค่าส่ง: ฿{slip.shippingFee.toFixed(2)}</span>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">ความคืบหน้าการแพ็ค</span>
          <span className="text-sm font-bold text-blue-600">
            {verifiedCount} / {items.length} รายการ
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5">
          <div
            className="bg-green-500 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${items.length > 0 ? (verifiedCount / items.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Items list */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-gray-700 mb-2">รายการสินค้า</h2>
        {items.map((item) => (
          <div
            key={item.id}
            className={`bg-white rounded-xl border p-4 ${
              item.verified ? "border-green-300 bg-green-50" : "border-gray-200"
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Verify checkbox */}
              <button
                onClick={() => toggleVerify(item.id, item.verified)}
                className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  item.verified
                    ? "bg-green-500 border-green-500 text-white"
                    : "border-gray-300 hover:border-blue-400"
                }`}
              >
                {item.verified ? "✓" : ""}
              </button>

              {/* Product info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.productNameTh}</p>
                    {item.productNameEn && (
                      <p className="text-xs text-gray-400">{item.productNameEn}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-700">x{item.orderedQty}</p>
                    {item.quantity !== item.orderedQty && (
                      <p className="text-xs text-orange-500">แพ็ค: {item.quantity}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  {item.productSku && (
                    <span className="text-xs text-gray-400">SKU: {item.productSku}</span>
                  )}
                  <span className="text-xs text-blue-600">
                    ฿{item.unitPrice.toFixed(2)}
                  </span>
                </div>
                {/* Batch/Lot info */}
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    placeholder="Lot/เลขที่ผลิต"
                    defaultValue={item.lotNumber || ""}
                    className="w-1/2 px-2 py-1 text-xs border border-gray-200 rounded"
                    onBlur={(e) => {
                      apiClient(`/api/packing/verify/${item.id}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                        body: JSON.stringify({ lotNumber: e.target.value, verified: item.verified }),
                      });
                    }}
                  />
                  <input
                    type="text"
                    placeholder="วันหมดอายุ"
                    defaultValue={item.expiryDate || ""}
                    className="w-1/2 px-2 py-1 text-xs border border-gray-200 rounded"
                    onBlur={(e) => {
                      apiClient(`/api/packing/verify/${item.id}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                        body: JSON.stringify({ expiryDate: e.target.value, verified: item.verified }),
                      });
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom actions */}
      <div className="flex gap-3 mt-8 no-print">
        <button
          onClick={() => navigate("/seller/orders")}
          className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
        >
          ← กลับไปรายการออเดอร์
        </button>
        <button
          onClick={completePacking}
          disabled={completing || verifiedCount < items.length}
          className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {completing
            ? "กำลังดำเนินการ..."
            : verifiedCount < items.length
            ? `✅ ตรวจสอบ ${verifiedCount}/${items.length} รายการก่อนเสร็จสิ้น`
            : "✅ เสร็จสิ้นแพ็ค"}
        </button>
      </div>

      {/* P2-2: Print Packing Slip Layout */}
      <div className="print-content" style={{ display: "none" }}>
        <div className="print-slip">
          {/* Header: Store info */}
          <div className="print-header">
            <div className="store-info">
              <h1 className="store-name">{storeName}</h1>
              <p className="store-address">{storeAddr}</p>
              {storePhone && <p className="store-phone">โทร: {storePhone}</p>}
              {storeTaxId && <p className="store-taxid">เลขที่ผู้เสียภาษี: {storeTaxId}</p>}
            </div>
            <div className="slip-title-box">
              <h2 className="slip-title">ใบแพ็คสินค้า</h2>
              <p className="slip-number">Packing Slip</p>
            </div>
          </div>

          <hr className="print-divider" />

          {/* Slip & Order info */}
          <div className="print-info-grid">
            <div className="info-left">
              <table className="info-table">
                <tbody>
                  <tr>
                    <td className="info-label">เลขที่ใบแพ็ค:</td>
                    <td className="info-value"><strong>{slip.slipNumber}</strong></td>
                  </tr>
                  <tr>
                    <td className="info-label">เลขที่ออเดอร์:</td>
                    <td className="info-value">{slip.orderNumber}</td>
                  </tr>
                  <tr>
                    <td className="info-label">วันที่สั่งซื้อ:</td>
                    <td className="info-value">{new Date(slip.orderedAt).toLocaleString("th-TH")}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="info-right">
              <table className="info-table">
                <tbody>
                  <tr>
                    <td className="info-label">ชื่อลูกค้า:</td>
                    <td className="info-value"><strong>{slip.customerName}</strong></td>
                  </tr>
                  {slip.customerPhone && (
                    <tr>
                      <td className="info-label">เบอร์โทร:</td>
                      <td className="info-value">{slip.customerPhone}</td>
                    </tr>
                  )}
                  {shippingAddress && (
                    <tr>
                      <td className="info-label">ที่อยู่จัดส่ง:</td>
                      <td className="info-value">{shippingAddress}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <hr className="print-divider" />

          {/* Items table */}
          <table className="print-items-table">
            <thead>
              <tr>
                <th style={{ width: "40px", textAlign: "center" }}>#</th>
                <th style={{ textAlign: "left" }}>รายการสินค้า</th>
                <th style={{ width: "80px", textAlign: "center" }}>จำนวน</th>
                <th style={{ width: "100px", textAlign: "center" }}>Batch/Lot</th>
                <th style={{ width: "90px", textAlign: "center" }}>วันหมดอายุ</th>
                <th style={{ width: "60px", textAlign: "center" }}>ตรวจ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id}>
                  <td style={{ textAlign: "center" }}>{idx + 1}</td>
                  <td>
                    <div className="print-product-name">{item.productNameTh}</div>
                    {item.productNameEn && (
                      <div className="print-product-sku">{item.productSku}</div>
                    )}
                  </td>
                  <td style={{ textAlign: "center" }}>{item.quantity}</td>
                  <td style={{ textAlign: "center", fontFamily: "monospace", fontSize: "11px" }}>
                    {item.lotNumber || "-"}
                  </td>
                  <td style={{ textAlign: "center", fontSize: "11px" }}>
                    {item.expiryDate || "-"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span className="verify-box">{item.verified ? "✓" : ""}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <hr className="print-divider" />

          {/* Summary */}
          <div className="print-summary">
            <div className="summary-left">
              <p className="summary-total-items">รวมทั้งหมด {items.length} รายการ</p>
              <p className="summary-verified">
                ตรวจสอบแล้ว: {verifiedCount}/{items.length} รายการ
                {verifiedCount < items.length ? " ⚠️ ยังไม่ครบ" : " ✅ ครบแล้ว"}
              </p>
            </div>
            <div className="summary-right">
              <table className="summary-table">
                <tbody>
                  <tr>
                    <td className="summary-label">ยอดรวมสินค้า:</td>
                    <td className="summary-value">฿{slip.subtotal.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="summary-label">ค่าจัดส่ง:</td>
                    <td className="summary-value">฿{slip.shippingFee.toFixed(2)}</td>
                  </tr>
                  <tr className="summary-grand-total">
                    <td className="summary-label"><strong>ยอดรวมทั้งสิ้น:</strong></td>
                    <td className="summary-value"><strong>฿{slip.grandTotal.toFixed(2)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <hr className="print-divider" />

          {/* Verification checklist */}
          <div className="print-verification">
            <h3>รายการตรวจสอบก่อนจัดส่ง</h3>
            <div className="checklist-grid">
              <div className="checklist-item">
                <span className="checklist-box"></span>
                <span>ตรวจสอบสินค้าถูกต้องครบถ้วน</span>
              </div>
              <div className="checklist-item">
                <span className="checklist-box"></span>
                <span>ตรวจสอบ Batch/Lot ตรงตามที่ระบุ</span>
              </div>
              <div className="checklist-item">
                <span className="checklist-box"></span>
                <span>บรรจุภัณฑ์เรียบร้อย / ปิดผนึก</span>
              </div>
              <div className="checklist-item">
                <span className="checklist-box"></span>
                <span>ที่อยู่จัดส่งถูกต้อง</span>
              </div>
            </div>
          </div>

          {/* Signature line */}
          <div className="print-signature">
            <div className="signature-block">
              <p className="signature-label">ผู้ตรวจสอบ/แพ็ค</p>
              <div className="signature-line"></div>
              <p className="signature-date">วันที่ ..../..../....</p>
            </div>
            <div className="signature-block">
              <p className="signature-label">ผู้รับผิดชอบ</p>
              <div className="signature-line"></div>
              <p className="signature-date">วันที่ ..../..../....</p>
            </div>
          </div>

          {/* Footer */}
          <div className="print-footer">
            <p>{printFooter}</p>
            <p className="print-footer-small">พิมพ์เมื่อ {new Date().toLocaleString("th-TH")}</p>
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; margin: 0; padding: 0; }
          @page { margin: 15mm 10mm; }
        }

        @media print {
          .print-content {
            display: block !important;
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            background: white;
            z-index: 9999;
          }
          .print-slip {
            max-width: 210mm;
            margin: 0 auto;
            padding: 20px 30px;
            font-family: 'Sarabun', 'Noto Sans Thai', 'Kanit', 'Prompt', 'IBM Plex Sans Thai', sans-serif;
            color: #000;
            font-size: 12px;
          }
          .print-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 10px;
          }
          .store-name {
            font-size: 20px;
            font-weight: bold;
            margin: 0 0 4px 0;
          }
          .store-address, .store-phone, .store-taxid {
            margin: 1px 0;
            font-size: 11px;
            color: #333;
          }
          .slip-title-box {
            text-align: right;
          }
          .slip-title {
            font-size: 18px;
            font-weight: bold;
            margin: 0;
          }
          .slip-number {
            font-size: 11px;
            color: #666;
            margin: 0;
          }
          .print-divider {
            border: none;
            border-top: 1.5px solid #333;
            margin: 8px 0;
          }
          .print-info-grid {
            display: flex;
            justify-content: space-between;
            gap: 20px;
          }
          .info-left, .info-right {
            flex: 1;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
          }
          .info-table td {
            padding: 2px 4px;
            font-size: 11px;
            vertical-align: top;
          }
          .info-label {
            width: 100px;
            font-weight: 500;
            color: #555;
            white-space: nowrap;
          }
          .info-value {
            color: #000;
          }
          .print-items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 8px 0;
            font-size: 11px;
          }
          .print-items-table th {
            background: #f0f0f0;
            padding: 6px 4px;
            border: 1px solid #999;
            font-weight: 600;
          }
          .print-items-table td {
            padding: 5px 4px;
            border: 1px solid #ccc;
            vertical-align: middle;
          }
          .print-product-name {
            font-size: 11px;
            font-weight: 500;
          }
          .print-product-sku {
            font-size: 9px;
            color: #888;
            font-family: monospace;
          }
          .verify-box {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 1.5px solid #333;
            text-align: center;
            line-height: 16px;
            font-size: 12px;
            font-weight: bold;
          }
          .print-summary {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin: 6px 0;
          }
          .summary-left {
            font-size: 11px;
            color: #555;
          }
          .summary-table {
            border-collapse: collapse;
          }
          .summary-table td {
            padding: 2px 4px;
            font-size: 11px;
          }
          .summary-label {
            text-align: right;
            color: #555;
          }
          .summary-value {
            text-align: right;
            min-width: 80px;
          }
          .summary-grand-total td {
            font-size: 13px;
            border-top: 1px solid #333;
            padding-top: 4px;
          }
          .print-verification {
            margin: 10px 0;
          }
          .print-verification h3 {
            font-size: 12px;
            font-weight: bold;
            margin: 0 0 6px 0;
          }
          .checklist-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px 20px;
          }
          .checklist-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
          }
          .checklist-box {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 1.5px solid #333;
            flex-shrink: 0;
          }
          .print-signature {
            display: flex;
            justify-content: space-between;
            margin: 20px 0 10px 0;
            padding: 0 20px;
          }
          .signature-block {
            text-align: center;
            min-width: 180px;
          }
          .signature-label {
            font-size: 11px;
            color: #555;
            margin: 0 0 4px 0;
          }
          .signature-line {
            width: 180px;
            height: 40px;
            border-bottom: 1px solid #333;
            margin: 0 auto 4px auto;
          }
          .signature-date {
            font-size: 10px;
            color: #888;
            margin: 0;
          }
          .print-footer {
            text-align: center;
            margin-top: 16px;
            padding-top: 8px;
            border-top: 1px solid #ccc;
            font-size: 11px;
            color: #666;
          }
          .print-footer-small {
            font-size: 9px;
            color: #999;
          }
        }
      `}</style>
    </div>
  );
}
