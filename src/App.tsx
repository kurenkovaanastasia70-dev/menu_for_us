import { Shell } from "@/components/layout/Shell";
import { AppProvider, useApp } from "@/context/AppContext";
import { CartPage } from "@/pages/CartPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { HistoryDetailPage } from "@/pages/HistoryDetailPage";
import { HistoryPage } from "@/pages/HistoryPage";
import { LoginPage } from "@/pages/LoginPage";
import { MenuPage } from "@/pages/MenuPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { PlanPage } from "@/pages/PlanPage";
import { ProductsPage } from "@/pages/ProductsPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { RecipePage } from "@/pages/RecipePage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { TrainingPage } from "@/pages/TrainingPage";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <p className="font-display text-3xl">Меню для нас</p>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, session } = useApp();
  if (!isSupabaseConfigured()) return <>{children}</>;
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireHousehold({ children }: { children: ReactNode }) {
  const { loading, profile, household, session } = useApp();
  if (!isSupabaseConfigured()) return <>{children}</>;
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile || !household) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { loading, session, profile, household } = useApp();
  if (loading) return <Splash />;
  if (session && profile && household) return <Navigate to="/" replace />;
  if (session && (!profile || !household)) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <GuestOnly>
                <LoginPage />
              </GuestOnly>
            }
          />
          <Route path="/reset" element={<ResetPasswordPage />} />
          <Route
            path="/onboarding"
            element={
              <RequireAuth>
                <OnboardingPage />
              </RequireAuth>
            }
          />
          <Route
            element={
              <RequireAuth>
                <RequireHousehold>
                  <Shell />
                </RequireHousehold>
              </RequireAuth>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/plan" element={<PlanPage />} />
            <Route path="/menu" element={<MenuPage />} />
            <Route path="/menu/:planId" element={<MenuPage />} />
            <Route path="/menu/:planId/recipe/:dayIndex/:mealType" element={<RecipePage />} />
            <Route path="/training" element={<TrainingPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/cart/:planId" element={<CartPage />} />
            <Route path="/fridge" element={<Navigate to="/cart" replace />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/history/:planId" element={<HistoryDetailPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AppProvider>
  );
}
