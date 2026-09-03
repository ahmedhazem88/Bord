import { Link } from "react-router-dom";
import { PublicLayout } from "../components/PublicLayout";
import { useDocumentHead } from "../hooks/useDocumentHead";

/** Custom 404 — reused both as the router's catch-all and inline when a slug lookup comes back empty. */
export function NotFoundPage() {
  useDocumentHead({
    title: "Page not found",
    description: "The page you're looking for doesn't exist or may have moved.",
    path: window.location.pathname,
    noindex: true,
  });

  return (
    <PublicLayout>
      <div className="notfound">
        <p className="notfound-code">404</p>
        <h1>We couldn't find that page</h1>
        <p className="subtle">It may have moved, or the link may be out of date.</p>
        <div className="hero-actions">
          <Link to="/" className="btn">
            Go home
          </Link>
          <Link to="/professionals" className="btn btn-secondary">
            Browse professionals
          </Link>
          <Link to="/companies" className="btn btn-secondary">
            Browse companies
          </Link>
        </div>
      </div>
    </PublicLayout>
  );
}
