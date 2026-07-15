import { useSettings } from "../contexts/SettingsContext";

export default function LicenseBadge() {
  const { settings } = useSettings();

  if (!settings?.licenseNumber) return null;

  return (
    <div className="bg-white border border-green-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {/* License Icon */}
        <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center shrink-0">
          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm">
            {settings.storeName || "ร้านยา"} — {settings.storeType || "ร้านขายยาแผนปัจจุบัน"}
          </h3>
          
          <div className="mt-2 space-y-1 text-xs text-gray-600">
            {settings.licenseNumber && (
              <p>📜 ใบอนุญาตที่ <span className="font-mono font-semibold text-green-700">{settings.licenseNumber}</span></p>
            )}
            {settings.pharmacistName && (
              <p>👨‍⚕️ เภสัชกร: {settings.pharmacistName} (ใบประกอบฯ {settings.pharmacistLicense || "-"})</p>
            )}
            {settings.operatingHours && (
              <p>⏰ {settings.operatingHours}</p>
            )}
            {settings.storePhone && (
              <p>📞 {settings.storePhone}</p>
            )}
          </div>
          
          {/* Show license image */}
          {settings.licenseImage && (
            <details className="mt-2">
              <summary className="text-xs text-blue-600 cursor-pointer hover:underline">
                📋 ดูใบอนุญาต
              </summary>
              <img src={settings.licenseImage} alt="ใบอนุญาต ขย.5" 
                className="mt-2 max-w-full rounded-lg border border-gray-200 shadow-sm" />
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
