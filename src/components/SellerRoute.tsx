import { Navigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import SellerBot from "./SellerBot";

export default function SellerRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  // Only allow specific admin users
  const ALLOWED_ROLES = ["SELLER", "ADMIN", "SUPER_ADMIN"];
  const ADMIN_EMAILS: string[] = [];
  if (!ADMIN_EMAILS.includes(user.email || "") && !ALLOWED_ROLES.includes(user.role || "")) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
        <div className="text-center">
          <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-red-600 text-2xl">!</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">ไม่ได้รับอนุญาต</h2>
          <p className="text-sm text-gray-500">เฉพาะผู้ดูแลระบบเท่านั้นที่เข้าถึงหน้านี้ได้</p>
          <Link to="/" className="inline-block mt-4 text-blue-600 font-medium hover:underline">กลับหน้าแรก</Link>
        </div>
      </div>
    );
  }
  return <><SellerBot />{children}</>;
}
