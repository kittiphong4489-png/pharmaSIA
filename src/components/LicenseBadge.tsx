import { useSettings } from "../contexts/SettingsContext";

export default function LicenseBadge() {
  const { settings } = useSettings();
  if (!settings?.licenseNumber) return null;

  return (
    <div className="bg-gradient-to-br from-white to-green-50 border border-green-200 rounded-2xl p-6 shadow-lg">
      <div className="flex flex-col sm:flex-row gap-6">
        {/* Pharmacist Photo */}
        <div className="shrink-0">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border-4 border-white shadow-lg bg-gradient-to-br from-green-100 to-green-200">
            {settings.pharmacistPhoto ? (
              <img src={settings.pharmacistPhoto} alt={settings.pharmacistName || "เภสัชกร"} 
                className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl">👨‍⚕️</div>
            )}
          </div>
        </div>
        
        <div className="flex-1">
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <span className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </span>
            <h3 className="font-bold text-gray-900 text-lg">
              {settings.storeName || "ร้านยา"}
            </h3>
            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
              ได้รับอนุญาต
            </span>
          </div>
          
          {/* Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-green-600">📜</span>
              <span className="text-gray-600">ใบอนุญาตที่</span>
              <span className="font-mono font-bold text-green-700">{settings.licenseNumber}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-600">👨‍⚕️</span>
              <span className="text-gray-600">{settings.pharmacistName || "เภสัชกร"}</span>
            </div>
            {settings.pharmacistLicense && (
              <div className="flex items-center gap-2">
                <span className="text-green-600">🎓</span>
                <span className="text-gray-600">ใบประกอบฯ {settings.pharmacistLicense}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-green-600">📞</span>
              <span className="text-gray-600">{settings.storePhone || settings.promptpayPhone || "-"}</span>
            </div>
            {settings.operatingHours && (
              <div className="flex items-center gap-2 sm:col-span-2">
                <span className="text-green-600">⏰</span>
                <span className="text-gray-600 text-xs">{settings.operatingHours}</span>
              </div>
            )}
          </div>

          {/* License Document */}
          {settings.licenseImage && (
            <details className="mt-3">
              <summary className="text-sm text-green-700 cursor-pointer hover:underline font-medium">
                📋 ดูใบอนุญาต ขย.5
              </summary>
              <img src={settings.licenseImage} alt="ใบอนุญาต ขย.5" 
                className="mt-2 max-w-sm rounded-xl border border-green-200 shadow-md" />
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
