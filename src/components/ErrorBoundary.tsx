import { Component, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

interface Props { children: ReactNode }
interface State { hasError: boolean; error?: Error; errorInfo?: string }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    this.setState({ errorInfo: info?.componentStack || "" });
    console.error("[ErrorBoundary]", error, info);
  }

  handleRecover = () => {
    // Reset error state → re-render children
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-md text-center shadow-sm">
            <div className="text-5xl mb-4">😵</div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">เกิดข้อผิดพลาด</h2>
            <p className="text-sm text-gray-500 mb-2">ระบบพบปัญหา กรุณาลองใหม่อีกครั้ง</p>
            {this.state.error && (
              <p className="text-xs text-red-400 bg-red-50 rounded-lg p-2 mb-4 font-mono break-all">
                {this.state.error.message}
              </p>
            )}
            <div className="flex flex-col gap-3 justify-center">
              <button onClick={this.handleRecover}
                className="px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700">
                🔄 ลองอีกครั้ง
              </button>
              <button onClick={() => window.location.reload()}
                className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700">
                🔄 รีเฟรชหน้า (F5)
              </button>
              <button onClick={() => { window.location.href = "/"; }}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200">
                🏠 กลับหน้าแรก
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-4">
              หากยังไม่หาย — กด <strong>Cmd+Shift+R</strong> (Hard Refresh)
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
