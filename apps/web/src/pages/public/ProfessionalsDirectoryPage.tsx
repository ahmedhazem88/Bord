import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { PublicLayout } from "../../components/PublicLayout";
import { Breadcrumbs, breadcrumbJsonLd } from "../../components/Breadcrumbs";
import { useDocumentHead } from "../../hooks/useDocumentHead";

interface Professional {
  publicSlug: string;
  fullName: string;
  headline: string | null;
}

interface ProfessionalsResponse {
  page: number;
  pageSize: number;
  professionals: Professional[];
}

export function ProfessionalsDirectoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const [data, setData] = useState<ProfessionalsResponse | null>(null);

  useEffect(() => {
    api<ProfessionalsResponse>("GET", `/public/professionals?page=${page}`)
      .then(setData)
      .catch(() => setData(null));
  }, [page]);

  useDocumentHead({
    title: "Governance professionals directory",
    description: "Browse verified directors, chairpersons, secretaries, and compliance officers available for board and governance roles in Egypt.",
    path: page > 1 ? `/professionals?page=${page}` : "/professionals",
    jsonLd: breadcrumbJsonLd([{ label: "Home", path: "/" }, { label: "Professionals" }], window.location.origin),
  });

  const professionals = data?.professionals ?? [];

  return (
    <PublicLayout>
      <Breadcrumbs items={[{ label: "Home", path: "/" }, { label: "Professionals" }]} />
      <h1>Governance professionals</h1>
      <p className="subtle">Verified directors, chairpersons, secretaries, and compliance officers across Bord's member companies.</p>

      {data && professionals.length === 0 && page === 1 && <p className="subtle">No public profiles yet.</p>}

      <div className="directory-grid">
        {professionals.map((p) => (
          <Link key={p.publicSlug} to={`/professionals/${p.publicSlug}`} className="card directory-card">
            <h3>{p.fullName}</h3>
            {p.headline && <p className="subtle">{p.headline}</p>}
          </Link>
        ))}
      </div>

      <div className="pagination">
        <button className="btn-secondary btn" disabled={page <= 1} onClick={() => setSearchParams({ page: String(page - 1) })}>
          ← Previous
        </button>
        <span className="subtle">Page {page}</span>
        <button
          className="btn-secondary btn"
          disabled={!data || professionals.length < data.pageSize}
          onClick={() => setSearchParams({ page: String(page + 1) })}
        >
          Next →
        </button>
      </div>
    </PublicLayout>
  );
}
