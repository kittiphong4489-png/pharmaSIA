import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiClient } from "../lib/api";

// ── Types ──
export interface StoreSettings {
  storeName: string;
  storeNameTh: string;
  storeAddress: string;
  storePhone: string;
  storeEmail: string;
  taxId: string;
  logoUrl: string;
  lineId: string;
  facebookUrl: string;
  footer: string;
  promptpayPhone: string;
}

interface SettingsContextType {
  settings: StoreSettings | null;
  isLoading: boolean;
  error: string | null;
  refreshSettings: () => void;
}

// ── Display helpers (Graceful Fallback) ──
export function getStoreDisplayName(settings: StoreSettings | null): string {
  return settings?.storeNameTh || settings?.storeName || "PharmaSIA";
}

export function getStoreLogo(settings: StoreSettings | null): string | null {
  return settings?.logoUrl || null;
}

// ── Context ──
const SettingsContext = createContext<SettingsContextType>({
  settings: null,
  isLoading: true,
  error: null,
  refreshSettings: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient("/api/settings");
      if (data?.settings) {
        setSettings(data.settings);
      } else {
        throw new Error("Invalid settings response");
      }
    } catch (e: any) {
      console.error("Failed to load settings:", e);
      setError(e?.message || "Unknown error");
      if (!settings) setSettings(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings, refreshKey]);

  const refreshSettings = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, isLoading, error, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextType {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
