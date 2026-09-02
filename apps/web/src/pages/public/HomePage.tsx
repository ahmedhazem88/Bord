import { Link } from "react-router-dom";
import { PublicLayout } from "../../components/PublicLayout";
import { useDocumentHead } from "../../hooks/useDocumentHead";

const TITLE = "Bord — Governance Platform & Professional Network for FRA-Regulated Entities";
const DESCRIPTION =
  "Bord runs board and general-assembly governance for Egypt's FRA-regulated financial entities, and connects them with verified governance professionals — directors, secretaries, and compliance officers.";

export function HomePage() {
  useDocumentHead({
    title: "Governance platform & professional network",
    description: DESCRIPTION,
    path: "/",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Bord",
      url: window.location.origin,
      description: DESCRIPTION,
    },
  });

  return (
    <PublicLayout>
      <section className="hero">
        <h1>{TITLE.split(" — ")[0]}</h1>
        <p className="hero-lede">
          Board meetings, general assemblies, resolutions, and compliance — run to the letter of Egyptian financial-sector
          law — plus a public network of verified governance professionals available to serve on your board.
        </p>
        <div className="hero-actions">
          <Link to="/register" className="btn">
            Create an account
          </Link>
          <Link to="/professionals" className="btn btn-secondary">
            Browse professionals
          </Link>
        </div>
      </section>

      <section className="feature-grid">
        <article className="card">
          <h3>Board & GA governance</h3>
          <p className="subtle">
            Scheduling, context-based quorum, four-value voting, dual-signed minutes, and a hash-chained audit trail —
            built to the FRA's rules for insurance, leasing, factoring, mortgage finance, microfinance, and brokerage
            entities.
          </p>
        </article>
        <article className="card">
          <h3>Compliance assistant</h3>
          <p className="subtle">
            A searchable directory of minutes and resolutions, with computed regulatory-deadline alerts across every
            entity you're part of.
          </p>
        </article>
        <article className="card">
          <h3>Professional network</h3>
          <p className="subtle">
            Directors, chairpersons, and compliance officers keep one public profile across every board they serve on —
            discoverable by the companies who need them.
          </p>
          <Link to="/professionals">Browse the directory →</Link>
        </article>
      </section>

      <section className="cta-band">
        <h2>Looking for governance talent?</h2>
        <p className="subtle">Browse verified professionals or list your company's board.</p>
        <div className="hero-actions">
          <Link to="/companies" className="btn btn-secondary">
            Browse companies
          </Link>
          <Link to="/register" className="btn">
            Get started
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
