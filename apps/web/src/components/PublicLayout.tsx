import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Header/footer shell for the public, unauthenticated site (home, directories,
 * profiles). Deliberately a different chrome from the private app's Layout —
 * Jakob's Law cuts both ways: this should look like a public marketing/
 * directory site (nav left, primary action right), while the private
 * workspace should look like a familiar SaaS dashboard. Nav is capped at
 * three choices (Professionals, Companies, Sign in/Dashboard) per Hick's Law.
 */
export function PublicLayout({ children }: { children: ReactNode }) {
  const { token } = useAuth();

  return (
    <div className="public-shell">
      <header className="public-header">
        <div className="public-header-inner">
          <Link to="/" className="public-logo">
            Bord
          </Link>
          <nav className="public-nav" aria-label="Main">
            <Link to="/professionals">Professionals</Link>
            <Link to="/companies">Companies</Link>
          </nav>
          <Link to={token ? "/dashboard" : "/login"} className="btn public-cta">
            {token ? "Go to dashboard" : "Sign in"}
          </Link>
        </div>
      </header>

      <main className="public-main">{children}</main>

      <footer className="public-footer">
        <div className="public-footer-inner">
          <div>
            <strong>Bord</strong>
            <p className="subtle">Governance platform and professional network for FRA-regulated financial entities in Egypt.</p>
          </div>
          <nav aria-label="Footer">
            <Link to="/">Home</Link>
            <Link to="/professionals">Professionals directory</Link>
            <Link to="/companies">Companies directory</Link>
            <Link to="/register">Create an account</Link>
            <Link to="/login">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
