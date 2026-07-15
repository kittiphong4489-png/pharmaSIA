import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { apiClient, uploadImage, uploadSlipImage } from "../lib/api";
import { getSessionId } from "../lib/session";

interface CartItem {
  id: number; sessionId: string; productId: number; quantity: number;
  nameTh: string; nameEn: string; price: number; stock: number; image: string | null; unit: string; requiresPrescription: number;
}

interface CheckoutForm { customerName: string; customerPhone: string; address: string; district: string; province: string; zip: string; addressLabel: string; notes: string; }

interface PaymentInfo {
  id: number;
  orderId: number;
  amount: number;
  status: string;
  qrImageUrl: string;
  createdAt: string;
}

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCheckout, setShowCheckout] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [orderResult, setOrderResult] = useState<{ success: boolean; orderNumber?: string; orderId?: number; grandTotal?: number; error?: string } | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [updatingItems, setUpdatingItems] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<CheckoutForm>({
    customerName: "", customerPhone: "", address: "", district: "", province: "", zip: "", addressLabel: "", notes: "",
  });
  const [prescriptionFile, setPrescriptionFile] = useState<File | null>(null);
  const [localQtys, setLocalQtys] = useState<Record<number, string>>({});
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipUrl, setSlipUrl] = useState<string>("");
  const [slipUploading, setSlipUploading] = useState(false);
  const [slipConfirmed, setSlipConfirmed] = useState(false);
  const slipInputRef = useRef<HTMLInputElement>(null);

  const loadCart = async () => {
    setLoading(true);
    try {
      const data = await apiClient(`/api/cart?sessionId=${getSessionId()}`);
      const loaded = data.items || [];
      setItems(loaded);
      setSelectedItems(new Set(loaded.map((i: CartItem) => i.id)));
    } catch {}
    setLoading(false);
  };
  useEffect(() => { loadCart(); }, []);

  // Auto-refresh cart when product added from other pages
  useEffect(() => {
    const handler = () => { loadCart(); };
    window.addEventListener("cart-updated", handler);
    return () => window.removeEventListener("cart-updated", handler);
  }, []);

  const toggleItem = (id: number) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map(i => i.id)));
    }
  };

  const selectedList = items.filter(i => selectedItems.has(i.id));

  const updateQty = async (id: number, qty: number) => {
    if (qty < 1 || updatingItems.has(id)) return;
    setUpdatingItems(prev => new Set(prev).add(id));
    try {
      await apiClient("/api/cart/update", { method: "POST", body: JSON.stringify({ id, quantity: qty, sessionId: getSessionId() }) });
      await loadCart();
    } catch (e) {
      console.error("อัปเดตจำนวนไม่สำเร็จ:", e);
      alert("ไม่สามารถอัปเดตจำนวนสินค้าได้ กรุณาลองใหม่");
    }
    setUpdatingItems(prev => { const next = new Set(prev); next.delete(id); return next; });
  };
  const removeItem = async (id: number) => {
    if (updatingItems.has(id)) return;
    setUpdatingItems(prev => new Set(prev).add(id));
    try {
      await apiClient("/api/cart/remove", { method: "POST", body: JSON.stringify({ id, sessionId: getSessionId() }) });
      await loadCart();
    } catch (e) {
      console.error("ลบสินค้าไม่สำเร็จ:", e);
      alert("ไม่สามารถลบสินค้าได้ กรุณาลองใหม่");
    }
    setUpdatingItems(prev => { const next = new Set(prev); next.delete(id); return next; });
  };

  const placeOrder = async () => {
    // Check if logged in
    const token = localStorage.getItem("pharma_token");
    if (!token) {
      alert("⚠️ กรุณาเข้าสู่ระบบก่อนสั่งซื้อ");
      window.location.href = "/login?redirect=/cart";
      return;
    }
    if (!form.customerName || !form.customerPhone || !form.address || !form.province || !form.zip) { alert("กรุณากรอกข้อมูลที่อยู่จัดส่งให้ครบถ้วน"); return; }
    if (selectedList.length === 0) { alert("กรุณาเลือกสินค้าที่ต้องการสั่งซื้อ"); return; }
    setOrdering(true);
    let orderData: any = null;
    try {
      orderData = await apiClient("/api/orders", {
        method: "POST",
        body: JSON.stringify({ ...form, sessionId: getSessionId(), items: selectedList.map(i => ({ productId: i.productId, quantity: i.quantity })) }),
      });
      if (orderData.success) {
        // Backend will clear cart items automatically
        const ev = new CustomEvent("cart-updated");
        window.dispatchEvent(ev);
        loadCart();
        // Save new address to user's profile
        if (!selectedAddressId && form.address) {
          const token = localStorage.getItem("pharma_token");
          if (token) {
            try {
              await apiClient("/api/account/addresses", {
                method: "POST",
                body: JSON.stringify({
                  label: form.addressLabel || "บ้าน",
                  fullName: form.customerName,
                  address: form.address,
                  district: form.district,
                  province: form.province,
                  zip: form.zip,
                  phone: form.customerPhone,
                  isDefault: savedAddresses.length === 0 ? true : false,
                }),
              });
            } catch (error) {
              console.error("บันทึกที่อยู่ไม่สำเร็จ:", error);
            }
          }
        }
        // Auto-create payment BEFORE setting result
        const token = localStorage.getItem("pharma_token");
        try {
          const payData = await apiClient("/api/payments/create", {
            method: "POST",
            body: JSON.stringify({ orderId: orderData.orderId }),
          });
          if (payData.payment) setPayment(payData.payment);
        } catch (error) {
          console.error("สร้าง Payment ไม่สำเร็จ:", error);
        }
        setOrderResult(orderData);
      } else {
        setOrderResult(orderData);
      }
    } catch (e) {
      console.error("Order failed:", e);
      setOrderResult({ success: false, error: "สั่งซื้อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });
    }
    setOrdering(false);
    // Upload prescription if exists — use local data, not state (avoid stale closure)
    if (orderData.success && prescriptionFile) {
      const formData = new FormData();
      formData.append("image", prescriptionFile);
      formData.append("orderId", String(orderData.orderId));
      const presToken = localStorage.getItem("pharma_token");
      try {
        await fetch("/api/orders/prescription", {
          method: "POST",
          headers: presToken ? { Authorization: `Bearer ${presToken}` } : {},
          body: formData,
        });
      } catch (error) {
        console.error("อัปโหลดใบสั่งยาไม่สำเร็จ:", error);
      }
    }
  };

  // Calculate shipping via API (only selected items)
  const [shippingInfo, setShippingInfo] = useState<{ shippingFee: number; totalWeight: number; promotion: string | null }>({
    shippingFee: 50, totalWeight: 0, promotion: null
  });

  useEffect(() => {
    if (selectedList.length > 0) {
      const productIds = selectedList.map(i => i.productId);
      const quantities = selectedList.map(i => i.quantity);
      apiClient("/api/shipping/calculate", {
        method: "POST",
        body: JSON.stringify({ productIds, quantities }),
      }).then(data => {
        if (data.success) setShippingInfo(data);
      }).catch((error) => {
        console.error("คำนวณค่าจัดส่งไม่สำเร็จ:", error);
      });
    } else {
      setShippingInfo({ shippingFee: 0, totalWeight: 0, promotion: null });
    }
  }, [selectedItems, items]);

  const subtotal = selectedList.reduce((s, i) => s + i.price * i.quantity, 0);
  const hasStockIssue = selectedList.some(i => i.quantity > (i.stock || 0));
  const shipping = shippingInfo.shippingFee;
  const grandTotal = subtotal + shipping;

  const createPayment = async () => {
    if (!orderResult?.orderId) return;
    setShowPayment(true);
    try {
      const token = localStorage.getItem("pharma_token");
      const data = await apiClient("/api/payments/create", {
        method: "POST",
        body: JSON.stringify({ orderId: orderResult.orderId }),
      });
      if (data.payment) setPayment(data.payment);
    } catch {}
  };

  const getAuthToken = () => localStorage.getItem("pharma_token");

  const handleSlipUpload = async (file: File) => {
    if (!file) return;
    setSlipUploading(true);
    try {
      const url = await uploadSlipImage(file);
      setSlipUrl(url);
      setSlipFile(file);
    } catch {
      alert("อัปโหลดสลิปไม่สำเร็จ กรุณาลองใหม่");
      setSlipFile(null);
      if (slipInputRef.current) slipInputRef.current.value = "";
    }
    setSlipUploading(false);
  };

  const confirmPaymentWithSlip = async () => {
    if (!payment || !slipUrl) return;
    try {
      const token = getAuthToken();
      await apiClient(`/api/payments/${payment.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slipUrl }),
      });
      setSlipConfirmed(true);
    } catch {
      alert("ยืนยันการชำระไม่สำเร็จ กรุณาลองใหม่ หรือติดต่อ Admin");
    }
  };

  const downloadInvoice = async (orderId: number, orderNumber?: string) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/orders/${orderId}/invoice?sessionId=${getSessionId()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Load failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt_${orderNumber || orderId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("ไม่สามารถดาวน์โหลดใบเสร็จได้");
    }
  };

  if (orderResult?.success) {
    const isPaid = slipConfirmed;

    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        {isPaid ? (
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
        <p className="text-gray-500 mb-1">เลขที่ออเดอร์: <span className="font-mono font-bold text-blue-600">{orderResult.orderNumber}</span></p>
        <p className="text-gray-500 mb-6">ยอดรวม: <span className="font-bold text-lg">฿{orderResult.grandTotal?.toFixed(2)}</span></p>

        {!showPayment && (
          <button onClick={createPayment}
            className="w-full mb-4 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-all">
            💳 ชำระด้วย QR PromptPay
          </button>
        )}

        {payment && !slipConfirmed && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 text-center">
            <h3 className="font-bold text-gray-900 mb-1">💳 ชำระเงินด้วย PromptPay</h3>
            <p className="text-sm text-gray-500 mb-4">กรุณาชำระเงิน <strong>฿{payment.amount.toFixed(2)}</strong> โดยสแกน QR ด้านล่าง</p>
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
              <p className="text-xl font-bold text-blue-600">฿{payment.amount.toFixed(2)}</p>
            </div>

            {/* Slip Upload */}
            <div className="mt-6 border-t border-gray-100 pt-4">
              <h4 className="font-semibold text-gray-900 mb-2 text-sm">📎 อัปโหลดสลิปโอนเงิน</h4>
              <p className="text-xs text-gray-500 mb-3">หลังจากโอนเงินแล้ว กรุณาอัปโหลดสลิปเพื่อยืนยัน</p>
              <input
                ref={slipInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleSlipUpload(f); }}
              />
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

        {slipConfirmed && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 text-center">
            <p className="text-green-700 font-semibold">✅ ยืนยันการชำระเงินเรียบร้อย!</p>
            <p className="text-xs text-green-600 mt-1">เจ้าหน้าที่จะตรวจสอบและดำเนินการจัดส่งโดยเร็ว</p>
          </div>
        )}

        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-wrap gap-2 justify-center">
            <button onClick={() => downloadInvoice(orderResult.orderId, orderResult.orderNumber)}
              className="inline-flex items-center justify-center px-4 py-2.5 bg-blue-50 text-blue-700 font-medium rounded-xl hover:bg-blue-100 border border-blue-200 text-sm">📄 ดูรายการสั่งซื้อ</button>
            <Link to="/products" className="inline-flex items-center justify-center px-4 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 text-sm">🛍️ เลือกสินค้าต่อ</Link>
            <Link to="/" className="inline-flex items-center justify-center px-4 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 border border-gray-200 text-sm">🏠 หน้าแรก</Link>
          </div>
        <div className="mt-4">
          <Link to={`/account/orders/${orderResult.orderId}`} className="text-sm text-red-500 hover:text-red-700 underline">
            ❌ ยกเลิกออเดอร์นี้
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">🛒 ตะกร้าสินค้า</h1>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="text-6xl mb-4">🛒</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">ตะกร้าว่างเปล่า</h2>
          <p className="text-gray-500 mb-6">เพิ่มสินค้าลงในตะกร้าก่อนสั่งซื้อ</p>
          <Link to="/products" className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-blue-700 shadow-sm">ดูสินค้า</Link>
        </div>
      ) : (
        <>
          {/* Select All */}
          <div className="flex items-center justify-between mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={selectedItems.size === items.length} onChange={toggleAll}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm font-medium text-gray-700">เลือกทั้งหมด ({items.length} รายการ)</span>
            </label>
            <span className="text-sm text-gray-400">เลือกแล้ว {selectedItems.size} รายการ</span>
          </div>

          <div className="space-y-3 mb-6">
            {items.map((item) => (
              <div key={item.id} className={`bg-white rounded-2xl border p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:shadow-sm transition-shadow ${selectedItems.has(item.id) ? 'border-blue-200' : 'border-gray-100 opacity-60'}`}>
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={selectedItems.has(item.id)} onChange={() => toggleItem(item.id)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0" />
                  <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl flex items-center justify-center text-xl sm:text-2xl flex-shrink-0 overflow-hidden">
                    {item.image ? <img src={item.image} alt={item.nameTh} className="w-full h-full object-contain" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} /> : <span>💊</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 text-sm truncate">{item.nameTh}</h3>
                    <p className="text-blue-600 font-bold">฿{item.price}</p>
                  </div>
                </div>
                {/* Mobile: qty + delete below, Desktop: inline */}
                <div className="flex items-center gap-2 justify-between sm:justify-end sm:flex-1">
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(item.id, item.quantity - 1)} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-gray-200 flex items-center justify-center text-sm hover:bg-gray-50">−</button>
                    <input type="number" min="1"
                      value={localQtys[item.id] ?? String(item.quantity)}
                      onChange={(e) => setLocalQtys(prev => ({ ...prev, [item.id]: e.target.value }))}
                      onBlur={(e) => {
                        const v = Math.min(parseInt(e.target.value) || 1, item.stock);
                        if (v >= 1 && v !== item.quantity) updateQty(item.id, v);
                        setLocalQtys(prev => { const next = { ...prev }; delete next[item.id]; return next; });
                      }}
                      className="w-14 text-center font-semibold text-sm border border-gray-200 rounded-lg px-1 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button onClick={() => updateQty(item.id, Math.min(item.quantity + 1, item.stock))} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-gray-200 flex items-center justify-center text-sm hover:bg-gray-50">+</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900 text-sm sm:text-base">฿{(item.price * item.quantity).toFixed(0)}</p>
                    <button onClick={() => removeItem(item.id)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!showCheckout ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <div className="space-y-3 mb-4">
                <div className="flex justify-between text-sm"><span className="text-gray-600">ยอดสินค้า (ที่เลือก)</span><span className="font-medium">฿{subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">ค่าจัดส่ง</span>
                  <span className="font-medium">{selectedList.length === 0 ? "-" : shipping === 0 ? <span className="text-blue-600">ฟรี</span> : `฿${shipping.toFixed(2)}`}</span>
                </div>
                {shippingInfo.totalWeight > 0 && <p className="text-xs text-gray-400">น้ำหนักรวม: {(shippingInfo.totalWeight / 1000).toFixed(2)} กก.</p>}
                {shippingInfo.promotion && <p className="text-xs text-green-600">✨ {shippingInfo.promotion}</p>}
                <div className="border-t border-gray-100 pt-3 flex justify-between">
                  <span className="font-semibold text-gray-900">รวมทั้งสิ้น</span>
                  <span className="text-xl font-bold text-blue-600">฿{grandTotal.toFixed(2)}</span>
                </div>
              </div>
              <button onClick={() => {
                if (selectedList.length === 0) { alert("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ"); return; }
                setShowCheckout(true);
                // Fetch saved addresses
                const token = localStorage.getItem("pharma_token");
                if (token) {
                  // Load user profile for name auto-fill
                  apiClient("/api/trpc/auth.me", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ "0": { token } }),
                  }).then((profileData: any) => {
                    const user = profileData?.[0]?.result?.data?.user;
                    if (user?.fullName) {
                      setForm(prev => ({ ...prev, customerName: user.fullName }));
                    }
                  }).catch(() => {});
                  // Load saved addresses
                  apiClient("/api/account/addresses")
                    .then(d => {
                      if (d.addresses?.length) {
                        setSavedAddresses(d.addresses);
                        const first = d.addresses[0];
                        setSelectedAddressId(first.id);
                        setForm({
                          customerName: form.customerName || first.fullName || "",
                          customerPhone: first.phone || form.customerPhone || "",
                          address: first.address || form.address,
                          district: first.district || form.district,
                          province: first.province || form.province,
                          zip: first.zip || form.zip,
                          addressLabel: form.addressLabel,
                          notes: form.notes,
                        });
                      }
                    }).catch(() => {});
                }
              }} className="w-full py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-blue-700 shadow-sm transition-all">
                ดำเนินการสั่งซื้อ ({selectedItems.size} รายการ)
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="font-bold text-gray-900 mb-4">📍 ที่อยู่จัดส่ง</h2>
              {orderResult && !orderResult.success && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{orderResult.error}</div>}
              
              {savedAddresses.length > 0 && (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-500 mb-2">เลือกที่อยู่ที่บันทึกไว้</label>
                  <div className="space-y-2">
                    {savedAddresses.map((addr: any) => (
                      <div key={addr.id}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedAddressId === addr.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-200'}`}
                        onClick={() => {
                          setSelectedAddressId(addr.id);
                          setForm({
                            customerName: form.customerName,
                            customerPhone: addr.phone || form.customerPhone,
                            address: addr.address || form.address,
                            district: addr.district || form.district,
                            province: addr.province || form.province,
                            zip: addr.zip || form.zip,
                            notes: form.notes,
                          });
                        }}>
                        <div className="flex items-start gap-2">
                          <input type="radio" checked={selectedAddressId === addr.id} onChange={() => {}} className="mt-1" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">{addr.label || "ที่อยู่"}</p>
                            <p className="text-xs text-gray-500">{addr.address}</p>
                            {(addr.district || addr.province) && <p className="text-xs text-gray-400">{addr.district} {addr.province} {addr.zip}</p>}
                            {addr.phone && <p className="text-xs text-gray-400">📞 {addr.phone}</p>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-center">
                    <button onClick={() => setSelectedAddressId(null)} className="text-xs text-blue-600 hover:text-blue-800">+ กรอกที่อยู่ใหม่</button>
                  </div>
                </div>
              )}
              
              {/* 📄 Prescription upload for controlled medications */}
              {selectedList.some(i => i.requiresPrescription) && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <h3 className="font-bold text-red-700 mb-2 flex items-center gap-2">
                    <span>📄</span> แนบใบสั่งยา (ยาควบคุมพิเศษ)
                  </h3>
                  <p className="text-xs text-red-600 mb-3">
                    สินค้าในออเดอร์นี้ต้องมีใบสั่งยา กรุณาอัปโหลดรูปใบสั่งยาของแพทย์
                  </p>
                  {prescriptionFile ? (
                    <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-red-100">
                      <span className="text-lg">🖼️</span>
                      <span className="text-sm flex-1 truncate">{prescriptionFile.name}</span>
                      <button onClick={() => setPrescriptionFile(null)} className="text-xs text-red-500 hover:text-red-700">เปลี่ยน</button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 bg-white rounded-lg p-3 border-2 border-dashed border-red-300 cursor-pointer hover:border-red-500 transition-all">
                      <span className="text-2xl">📷</span>
                      <span className="text-sm text-gray-600">แตะเพื่อเลือกรูปใบสั่งยา</span>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setPrescriptionFile(file);
                      }} />
                    </label>
                  )}
                </div>
              )}
              
              {!selectedAddressId && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">ชื่อผู้รับ</label><input value={form.customerName} onChange={(e) => setForm({...form, customerName: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">เบอร์โทร</label><input value={form.customerPhone} onChange={(e) => setForm({...form, customerPhone: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                </div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">ที่อยู่</label><input value={form.address} onChange={(e) => setForm({...form, address: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">เขต/อำเภอ</label><input value={form.district} onChange={(e) => setForm({...form, district: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">จังหวัด</label><input value={form.province} onChange={(e) => setForm({...form, province: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">รหัสไปรษณีย์</label><input value={form.zip} onChange={(e) => setForm({...form, zip: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" /></div>
                </div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">ป้ายชื่อที่อยู่ (เช่น บ้าน/ที่ทำงาน)</label><input value={form.addressLabel} onChange={(e) => setForm({...form, addressLabel: e.target.value})} placeholder="บ้าน" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">หมายเหตุ</label><input value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" /></div>
              </div>
              )}
              
              <div className="flex justify-between text-lg font-bold py-3 border-t border-gray-100 mt-4">
                <span className="text-gray-900">รวมทั้งสิ้น ({selectedItems.size} รายการ)</span>
                <span className="text-blue-600">฿{grandTotal.toFixed(2)}</span>
              </div>
              {hasStockIssue && (
                <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                  ⚠️ สินค้าบางรายการมีจำนวนเกินสต็อกคงเหลือ กรุณาปรับจำนวนก่อนสั่งซื้อ
                </div>
              )}
              <button onClick={() => setShowConfirmDialog(true)} disabled={ordering || hasStockIssue} className="w-full py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 transition-all">
                {ordering ? "กำลังสั่งซื้อ..." : "ยืนยันสั่งซื้อ"}
              </button>

              {/* Confirmation Dialog */}
              {showConfirmDialog && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowConfirmDialog(false)}>
                  <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">ยืนยันสั่งซื้อ</h3>
                    <p className="text-sm text-gray-500 mb-4">ยืนยันดำเนินการสั่งซื้อ {selectedItems.size} รายการ รวมเป็นเงิน <strong className="text-blue-600">฿{grandTotal.toFixed(2)}</strong></p>
                    <div className="flex gap-3">
                      <button onClick={() => setShowConfirmDialog(false)} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all">ยกเลิก</button>
                      <button onClick={() => { setShowConfirmDialog(false); placeOrder(); }} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-all">ยืนยัน</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
