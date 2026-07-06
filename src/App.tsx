import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LandingPage from "./pages/LandingPage";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import ClockIn from "./pages/ClockIn";
import Employees from "./pages/Employees";
import EmployeeHistory from "./pages/EmployeeHistory";
import Locations from "./pages/Locations";
import History from "./pages/History";
import MyHistory from "./pages/MyHistory";
import Reports from "./pages/Reports";
import EspelhoPonto from "./pages/EspelhoPonto";
import NotificationRecipients from "./pages/NotificationRecipients";
import FixedSchedules from "./pages/FixedSchedules";
import PunctualSchedules from "./pages/PunctualSchedules";
import Holidays from "./pages/Holidays";
import LatenessResponse from "./pages/LatenessResponse";
import FinancialManagement from "./pages/FinancialManagement";
import MasterPanel from "./pages/MasterPanel";
import Anotacoes from "./pages/Anotacoes";
import ShiftSwaps from "./pages/ShiftSwaps";
import MyShiftSwaps from "./pages/MyShiftSwaps";
import BlockedAccess from "./pages/BlockedAccess";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user, profile, companyStatus, isMasterUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Check if company is blocked (but not for master users)
  if (!isMasterUser && companyStatus?.isBlocked) {
    const status = companyStatus.status === 'cancelled' ? 'cancelled' : 
                   companyStatus.paymentStatus === 'overdue' ? 'overdue' : 'pending';
    return <BlockedAccess status={status} paymentStatus={companyStatus.paymentStatus || undefined} />;
  }

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user, profile, loading } = useAuth();

  if (loading || (user && !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Determine the default route based on user role
  const getDefaultRoute = () => {
    if (!user || !profile) return '/auth';
    if (profile.role === 'employee') return '/clock';
    return '/dashboard';
  };

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to={getDefaultRoute()} replace /> : <LandingPage />} />
      <Route path="/auth" element={user ? <Navigate to={getDefaultRoute()} replace /> : <Auth />} />
      
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute allowedRoles={['admin', 'manager']}>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/clock"
        element={
          <ProtectedRoute allowedRoles={['employee']}>
            <ClockIn />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/employees"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Employees />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/employee-history/:employeeId"
        element={
          <ProtectedRoute allowedRoles={['admin', 'manager']}>
            <EmployeeHistory />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/locations"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Locations />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/notifications"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <NotificationRecipients />
          </ProtectedRoute>
        }
      />

      <Route
        path="/feriados"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Holidays />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/history"
        element={
          <ProtectedRoute allowedRoles={['employee']}>
            <MyHistory />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/my-shift-swaps"
        element={
          <ProtectedRoute allowedRoles={['employee']}>
            <MyShiftSwaps />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/reports"
        element={
          <ProtectedRoute allowedRoles={['admin', 'manager']}>
            <Reports />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/espelho-ponto"
        element={
          <ProtectedRoute allowedRoles={['admin', 'manager']}>
            <EspelhoPonto />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/fixed-schedules"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <FixedSchedules />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/punctual-schedules"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <PunctualSchedules />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/financeiro"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <FinancialManagement />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/anotacoes"
        element={
          <ProtectedRoute allowedRoles={['admin', 'manager']}>
            <Anotacoes />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/master-panel"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <MasterPanel />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/shift-swaps"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <ShiftSwaps />
          </ProtectedRoute>
        }
      />
      
      {/* Public route - no auth required */}
      <Route path="/responder/:alertId" element={<LatenessResponse />} />
      
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
