import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { PublicLayout } from "../../components/PublicLayout";
import { Breadcrumbs, breadcrumbJsonLd } from "../../components/Breadcrumbs";
import { useDocumentHead } from "../../hooks/useDocumentHead";

interface Company {
  publicSlug: string;
  legalName: string;
  entityType: string;
  verificationStatus: string;
}

interface CompaniesResponse {
  page: number;
  pageSize: number;
  companies: Company[];
}

export function CompaniesDirectoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const [data, setData] = useState<CompaniesResponse | null>(null);

  useEffect(() => {
    api<CompaniesResponse>("GET", `/public/companies?page=${page}`)
      .then(setData)
      .catch(() => setData(null));
  }, [page]);

  useDocumentHead({
    title: "FRA-regulated companies directory",
    description: "Browse insurance, leasing, factoring, mortgage finance, microfinance, and brokerage companies governed on Bord.",
    path: page > 1 ? `/companies?page=${page}` : "/companies",
    jsonLd: breadcrumbJsonLd([{ label: "Home", path: "/" }, { label: "Companies" }], window.location.origin),
  });

  const companies = data?.companies ?? [];

  return (
    <PublicLayout>
      <Breadcrumbs items={[{ label: "Home", path: "/" }, { label: "Companies" }]} />
      <h1>Companies</h1>
      <p className="subtle">FRA-regulated entities governed on Bord.</p>

      {data && companies.length === 0 && page === 1 && <p className="subtle">No public company profiles yet.</p>}

      <div className="directory-grid">
        {companies.map((c) => (
          <Link key={c.publicSlug} to={`/companies/${c.publicSlug}`} className="card directory-card">
            <h3>{c.legalName}</h3>
            <p className="subtle">{c.entityType.replace(/_/g, " ")}</p>
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
          disabled={!data || companies.length < data.pageSize}
          onClick={() => setSearchParams({ page: String(page + 1) })}
        >
          Next →
        </button>
      </div>
    </PublicLayout>
  );
}
