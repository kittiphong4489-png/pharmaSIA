import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface User {
  id: number;
  fullName: string;
  email: string;
  phone?: string | null;
  role: string;
  tier: string;
  avatarUrl?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, fullName: string, phone: string, tier?: string, taxId?: string, address?: string, ownerName?: string, storePhone?: string) => Promise<{ success: boolean; error?: string }>;
  oauthLogin: (provider: "google" | "line", oauthId: string, email: string, fullName: string, avatarUrl?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isSeller: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function trpcCall(path: string, input: any): Promise<any> {
  return fetch(`/api/trpc/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then(r => r.json()).then((d) => d.result?.data);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("pharma_token"));
  const [loading, setLoading] = useState(true);

  // On mount: verify existing token
  useEffect(() => {
    const savedToken = localStorage.getItem("pharma_token");
    if (savedToken) {
      // Don't clear token on auth failure — keep it for retry
      trpcCall("auth.me", { token: savedToken }).then((data) => {
        if (data?.success && data.user) {
          setUser(data.user);
          setToken(savedToken);
        }
        setLoading(false);
      }).catch(() => {
        // Network error — keep token, retry on next refresh
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await trpcCall("auth.login", { email, password });
    if (data?.success) {
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem("pharma_token", data.token);
      return { success: true };
    }
    return { success: false, error: data?.error || "เข้าสู่ระบบล้มเหลว" };
  }, []);

  const register = useCallback(async (email: string, password: string, fullName: string, phone: string, tier?: string, taxId?: string, address?: string, ownerName?: string, storePhone?: string) => {
    const data = await trpcCall("auth.register", { email, password, fullName, phone, tier, taxId, address, ownerName, storePhone });
    if (data?.success) {
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem("pharma_token", data.token);
      return { success: true };
    }
    return { success: false, error: data?.error || "สมัครสมาชิกล้มเหลว" };
  }, []);

  const oauthLogin = useCallback(async (provider: "google" | "line", oauthId: string, email: string, fullName: string, avatarUrl?: string) => {
    const data = await trpcCall("auth.oauthLogin", { provider, oauthId, email, fullName, avatarUrl });
    if (data?.success) {
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem("pharma_token", data.token);
      return { success: true };
    }
    return { success: false, error: data?.error || "เข้าสู่ระบบล้มเหลว" };
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("pharma_token");
    // Clear cart session to avoid showing previous user's items
    localStorage.removeItem("pharma_session");
  }, []);

  const isSeller = user?.role === "SELLER" || user?.role === "ADMIN" || user?.role === "RETAIL" || user?.role === "CLINIC";

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, oauthLogin, logout, isSeller }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
