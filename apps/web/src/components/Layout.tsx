import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Layout({ children }: { children: ReactNode }) {
  const { decoded, logout } = useAuth();

  return (
    <div className="app-shell">
      <nav className="top-nav">
        <strong>Bord</strong>
        <div className="top-nav-links">
          <Link to="/">Entities</Link>
          <Link to="/my-capacities">My Capacities</Link>
          {decoded && <button className="btn-secondary btn" onClick={logout}>Sign out</button>}
        </div>
      </nav>
      {children}
    </div>
  );
}
