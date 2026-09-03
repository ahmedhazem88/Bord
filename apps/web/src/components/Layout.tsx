import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Layout({ children }: { children: ReactNode }) {
  const { decoded, logout } = useAuth();

  return (
    <div className="app-shell">
      <nav className="top-nav">
        <Link to="/dashboard" className="top-nav-logo">Bord</Link>
        <div className="top-nav-links">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/" className="subtle">Public site</Link>
          {decoded && <button className="btn-secondary btn" onClick={logout}>Sign out</button>}
        </div>
      </nav>
      {children}
    </div>
  );
}
