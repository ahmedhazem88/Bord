import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EntityGovernancePage } from "./pages/EntityGovernancePage";
import { HomePage } from "./pages/public/HomePage";
import { ProfessionalsDirectoryPage } from "./pages/public/ProfessionalsDirectoryPage";
import { ProfessionalProfilePage } from "./pages/public/ProfessionalProfilePage";
import { CompaniesDirectoryPage } from "./pages/public/CompaniesDirectoryPage";
import { CompanyProfilePage } from "./pages/public/CompanyProfilePage";
import { NotFoundPage } from "./pages/NotFoundPage";

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export function App() {
  return (
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
  );
}
