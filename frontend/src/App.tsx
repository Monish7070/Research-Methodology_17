import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import { useAuth } from "./context/AuthContext";
import { Spinner } from "./components/ui";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import DashboardPage from "./pages/DashboardPage";
import UploadPage from "./pages/UploadPage";
import CapturePage from "./pages/CapturePage";
import KeyframesPage from "./pages/KeyframesPage";
import DetectionPage from "./pages/DetectionPage";
import ExplainabilityPage from "./pages/ExplainabilityPage";
import PriorityPage from "./pages/PriorityPage";
import DefectsPage from "./pages/DefectsPage";
import MapPage from "./pages/MapPage";
import MaintenancePage from "./pages/MaintenancePage";
import ReportsPage from "./pages/ReportsPage";
import HistoryPage from "./pages/HistoryPage";
import UsersPage from "./pages/UsersPage";
import SettingsPage from "./pages/SettingsPage";
import NotFoundPage from "./pages/NotFoundPage";

function FullScreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <Spinner className="h-7 w-7" />
        <p className="text-xs font-medium tracking-wide">Loading URBAN VISION AI…</p>
      </div>
    </div>
  );
}

function RequireAuth({ children, permission }: { children: React.ReactNode; permission?: string }) {
  const { user, loading, can } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (permission && !can(permission)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
      <Route path="/forgot-password" element={<GuestOnly><ForgotPasswordPage /></GuestOnly>} />

      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/capture" element={<CapturePage />} />
        <Route path="/keyframes" element={<KeyframesPage />} />
        <Route path="/detection" element={<DetectionPage />} />
        <Route path="/explainability" element={<ExplainabilityPage />} />
        <Route path="/priority" element={<PriorityPage />} />
        <Route path="/defects" element={<DefectsPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/users" element={<RequireAuth permission="user:manage"><UsersPage /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth permission="settings:manage"><SettingsPage /></RequireAuth>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
