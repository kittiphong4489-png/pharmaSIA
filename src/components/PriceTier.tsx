import { useState } from "react";

interface Tier {
  qty: number;
  discount: number;
  label: string;
}

const DEFAULT_TIERS: Tier[] = [
  { qty: 12, discount: 10, label: "12+" },
  { qty: 36, discount: 15, label: "36+" },
  { qty: 72, discount: 20, label: "72+" },
];

interface Props {
  price: number;
  tiers?: Tier[];
  compact?: boolean;
}

export default function PriceTier({ price, tiers = DEFAULT_TIERS, compact }: Props) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShow(!show); }}
        className="text-[10px] text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1"
      >
        <span>📦</span>
        <span>ราคาส่ง</span>
        <span className={`text-xs transition-transform ${show ? "rotate-180" : ""}`}>▼</span>
      </button>

      {show && (
        <div className={`absolute z-10 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 ${compact ? "right-0 w-44" : "w-48"}`}>
          <div className="text-xs font-semibold text-gray-500 mb-2">ราคาตามจำนวน</div>
          <div className="space-y-1.5">
            {tiers.map((t) => {
              const tierPrice = price * (1 - t.discount / 100);
              return (
                <div key={t.qty} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-gray-500 font-medium">{t.label}</span>
                  <span className="text-gray-700 font-semibold">฿{tierPrice.toFixed(2)}</span>
                  <span className="text-green-500 font-medium">-{t.discount}%</span>
                </div>
              );
            })}
          </div>
          <div className="text-[10px] text-gray-400 mt-2 border-t border-gray-100 pt-2">
            ต่อหน่วย
          </div>
        </div>
      )}
    </div>
  );
}
