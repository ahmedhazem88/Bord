import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { PublicLayout } from "../../components/PublicLayout";
import { Breadcrumbs, breadcrumbJsonLd } from "../../components/Breadcrumbs";
import { useDocumentHead } from "../../hooks/useDocumentHead";
import { NotFoundPage } from "../NotFoundPage";

interface BoardMember {
  role: string;
  startDate: string;
  name: string;
  slug: string;
}

interface CompanyProfile {
  legalName: string;
  registrationNumber: string;
  entityType: string;
  verificationStatus: string;
  about: string | null;
  website: string | null;
  publicSlug: string;
  board: BoardMember[];
}

export function CompanyProfilePage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [state, setState] = useState<{ status: "loading" } | { status: "ok"; data: CompanyProfile } | { status: "notfound" }>({
    status: "loading",
  });

  useEffect(() => {
    setState({ status: "loading" });
    api<CompanyProfile>("GET", `/public/companies/${slug}`)
      .then((data) => setState({ status: "ok", data }))
      .catch(() => setState({ status: "notfound" }));
  }, [slug]);

  const company = state.status === "ok" ? state.data : null;

  useDocumentHead({
    title: company ? company.legalName : "Company profile",
    description: company
      ? (company.about ?? `${company.legalName} is an FRA-regulated ${company.entityType.replace(/_/g, " ").toLowerCase()} entity governed on Bord.`)
      : "FRA-regulated company profile.",
    path: `/companies/${slug}`,
    noindex: state.status !== "ok",
    jsonLd: company
      ? [
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: company.legalName,
            description: company.about ?? undefined,
            url: window.location.origin + `/companies/${company.publicSlug}`,
            sameAs: company.website ?? undefined,
            identifier: company.registrationNumber,
          },
          breadcrumbJsonLd(
            [{ label: "Home", path: "/" }, { label: "Companies", path: "/companies" }, { label: company.legalName }],
            window.location.origin,
          ),
        ]
      : undefined,
  });

  if (state.status === "loading") {
    return (
      <PublicLayout>
        <p className="subtle">Loading…</p>
      </PublicLayout>
    );
  }

  if (state.status === "notfound") {
    return <NotFoundPage />;
  }

  return (
    <PublicLayout>
      <Breadcrumbs items={[{ label: "Home", path: "/" }, { label: "Companies", path: "/companies" }, { label: company!.legalName }]} />
      <h1>{company!.legalName}</h1>
      <p className="subtle">
        {company!.entityType.replace(/_/g, " ")} · Reg. #{company!.registrationNumber}
      </p>
      {company!.about && <p>{company!.about}</p>}
      {company!.website && (
        <p>
          <a href={company!.website} target="_blank" rel="noopener noreferrer">
            {company!.website}
          </a>
        </p>
      )}

      <h2>Board</h2>
      {company!.board.length === 0 ? (
        <p className="subtle">No public board members listed.</p>
      ) : (
        <ul className="position-list">
          {company!.board.map((m, i) => (
            <li key={i} className="card">
              <Link to={`/professionals/${m.slug}`}>{m.name}</Link>
              <p className="subtle">
                {m.role.replace(/_/g, " ")} since {new Date(m.startDate).getFullYear()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </PublicLayout>
  );
}
