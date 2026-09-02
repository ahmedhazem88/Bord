import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";

// Route-level code splitting: each page ships as its own chunk, so a visitor
// to the public site never downloads the private governance workspace's
// code (and vice versa) — the two halves of this app are used by largely
// disjoint audiences.
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("./pages/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const EntityGovernancePage = lazy(() => import("./pages/EntityGovernancePage").then((m) => ({ default: m.EntityGovernancePage })));
const HomePage = lazy(() => import("./pages/public/HomePage").then((m) => ({ default: m.HomePage })));
const ProfessionalsDirectoryPage = lazy(() =>
  import("./pages/public/ProfessionalsDirectoryPage").then((m) => ({ default: m.ProfessionalsDirectoryPage })),
);
const ProfessionalProfilePage = lazy(() =>
  import("./pages/public/ProfessionalProfilePage").then((m) => ({ default: m.ProfessionalProfilePage })),
);
const CompaniesDirectoryPage = lazy(() =>
  import("./pages/public/CompaniesDirectoryPage").then((m) => ({ default: m.CompaniesDirectoryPage })),
);
const CompanyProfilePage = lazy(() => import("./pages/public/CompanyProfilePage").then((m) => ({ default: m.CompanyProfilePage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export function App() {
  return (
    <Suspense fallback={<div className="route-loading" aria-hidden="true" />}>
      <Routes>
        {/* Public site — unauthenticated, indexable */}
        <Route path="/" element={<HomePage />} />
        <Route path="/professionals" element={<ProfessionalsDirectoryPage />} />
        <Route path="/professionals/:slug" element={<ProfessionalProfilePage />} />
        <Route path="/companies" element={<CompaniesDirectoryPage />} />
        <Route path="/companies/:slug" element={<CompanyProfilePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Private workspace — authenticated governance app */}
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/entities/:entityId"
          element={
            <RequireAuth>
              <EntityGovernancePage />
            </RequireAuth>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
