import { Link, useNavigate } from "react-router-dom";
import { Home, ArrowLeft } from "lucide-react";

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-[80vh] bg-[#f8fafc] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-md w-full text-center shadow-sm">
        <div className="text-7xl mb-4">🔍</div>
        <h1 className="text-4xl font-bold text-gray-900 mb-2">404</h1>
        <h2 className="text-lg font-bold text-gray-900 mb-2">ไม่พบหน้าที่ค้นหา</h2>
        <p className="text-sm text-gray-500 mb-6">หน้าที่คุณกำลังมองหาไม่มีอยู่ หรือถูกลบไปแล้ว</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </button>
          <Link to="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors">
            <Home className="w-4 h-4" />
            หน้าแรก
          </Link>
        </div>
      </div>
    </div>
  );
}
