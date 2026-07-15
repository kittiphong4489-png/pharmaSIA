import { SettingsProvider } from "./contexts/SettingsContext";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useState } from "react";
import { trpc } from "./lib/trpc";
import { AuthProvider } from "./hooks/useAuth";
import Layout from "./components/Layout";
import SellerRoute from "./components/SellerRoute";
import AuthRoute from "./components/AuthRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import DebugPanel from "./components/DebugPanel";
import HomePage from "./pages/HomePage";
import ProductsPage from "./pages/ProductsPage";
import ProductDetailPage from "./pages/ProductDetailPage";
import CartPage from "./pages/CartPage";
import AccountOrdersPage from "./pages/AccountOrdersPage";
import AccountOrderDetailPage from "./pages/AccountOrderDetailPage";
import AccountProfilePage from "./pages/AccountProfilePage";
import SellerDashboard from "./pages/SellerDashboard";
import SellerProductsPage from "./pages/SellerProductsPage";
import SellerOrdersPage from "./pages/SellerOrdersPage";
import SellerSettingsPage from "./pages/SellerSettingsPage";
import SellerCategoriesPage from "./pages/SellerCategoriesPage";
import SellerShippingPage from "./pages/SellerShippingPage";
import SellerPromotionsPage from "./pages/SellerPromotionsPage";
import SellerSubCategoriesPage from "./pages/SellerSubCategoriesPage";
import SalesReportsPage from "./pages/SalesReportsPage";
import SellerPricingPage from "./pages/SellerPricingPage";
import SellerBatchesPage from "./pages/SellerBatchesPage";
import TraceabilityPage from "./pages/TraceabilityPage";
import CustomerDetailPage from "./pages/CustomerDetailPage";
import CustomerListPage from "./pages/CustomerListPage";
import AccountingPage from "./pages/AccountingPage";
import PackingDetailPage from "./pages/PackingDetailPage";
import PrescriptionManagement from "./pages/PrescriptionManagement";
import LoginPage from "./pages/LoginPage";
import ForteProductManager from "./pages/ForteProductManager";
import AccountLayout from "./pages/AccountLayout";
import AccountDashboard from "./pages/AccountDashboard";
import AdminNotificationsPage from "./pages/AdminNotificationsPage";
import AuditLogPage from "./pages/AuditLogPage";
import PosPage from "./pages/PosPage";
import AdminUserManagementPage from "./pages/AdminUserManagementPage";
import AdminOrderPage from "./pages/AdminOrderPage";
import NotFoundPage from "./pages/NotFoundPage";

export default function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [httpBatchLink({ url: "/trpc" })],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ErrorBoundary>
            <SettingsProvider>
            <BrowserRouter>
              <Layout>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/products/:id" element={<ProductDetailPage />} />
                <Route path="/product/:id" element={<ProductDetailPage />} />
                <Route path="/seller" element={<SellerRoute><SellerDashboard /></SellerRoute>} />
                <Route path="/seller/products" element={<SellerRoute><SellerProductsPage /></SellerRoute>} />
                <Route path="/seller/orders" element={<SellerRoute><SellerOrdersPage /></SellerRoute>} />
                <Route path="/seller/forte" element={<SellerRoute><ForteProductManager /></SellerRoute>} />
                <Route path="/seller/settings" element={<SellerRoute><SellerSettingsPage /></SellerRoute>} />
                <Route path="/seller/reports" element={<SellerRoute><SalesReportsPage /></SellerRoute>} />
                <Route path="/seller/pricing" element={<SellerRoute><SellerPricingPage /></SellerRoute>} />
                <Route path="/seller/batches" element={<SellerRoute><SellerBatchesPage /></SellerRoute>} />
                <Route path="/seller/categories" element={<SellerRoute><SellerCategoriesPage /></SellerRoute>} />
                <Route path="/seller/shipping" element={<SellerRoute><SellerShippingPage /></SellerRoute>} />
                <Route path="/seller/promotions" element={<SellerRoute><SellerPromotionsPage /></SellerRoute>} />
                <Route path="/seller/sub-categories" element={<SellerRoute><SellerSubCategoriesPage /></SellerRoute>} />
                <Route path="/seller/traceability" element={<SellerRoute><TraceabilityPage /></SellerRoute>} />
                <Route path="/seller/pos" element={<SellerRoute><PosPage /></SellerRoute>} />
                <Route path="/seller/customers" element={<SellerRoute><CustomerListPage /></SellerRoute>} />
                <Route path="/seller/customers/:id" element={<SellerRoute><CustomerDetailPage /></SellerRoute>} />
                <Route path="/seller/accounting" element={<SellerRoute><AccountingPage /></SellerRoute>} />
                <Route path="/seller/packing/:slipId" element={<SellerRoute><PackingDetailPage /></SellerRoute>} />
                <Route path="/seller/notifications" element={<SellerRoute><AdminNotificationsPage /></SellerRoute>} />
                <Route path="/seller/audit-log" element={<SellerRoute><AuditLogPage /></SellerRoute>} />
                <Route path="/seller/orders" element={<SellerRoute><AdminOrderPage /></SellerRoute>} />
                <Route path="/seller/admin-users" element={<SellerRoute><AdminUserManagementPage /></SellerRoute>} />
                <Route path="/seller/prescriptions" element={<SellerRoute><PrescriptionManagement /></SellerRoute>} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/account" element={<AccountLayout />}>
                  <Route index element={<AccountDashboard />} />
                  <Route path="orders" element={<AccountOrdersPage />} />
                  <Route path="orders/:id" element={<AccountOrderDetailPage />} />
                  <Route path="profile" element={<AccountProfilePage />} />
                </Route>
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Layout>
          </BrowserRouter>
          <DebugPanel />
          </SettingsProvider>
          </ErrorBoundary>
        </AuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
