import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { PublicLayout } from "../../components/PublicLayout";
import { Breadcrumbs, breadcrumbJsonLd } from "../../components/Breadcrumbs";
import { useDocumentHead } from "../../hooks/useDocumentHead";
import { NotFoundPage } from "../NotFoundPage";

interface Position {
  role: string;
  startDate: string;
  endDate: string | null;
  entityName: string;
  entitySlug: string;
  entityType: string;
}

interface ProfessionalProfile {
  fullName: string;
  headline: string | null;
  bio: string | null;
  publicSlug: string;
  positions: Position[];
}

export function ProfessionalProfilePage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [state, setState] = useState<{ status: "loading" } | { status: "ok"; data: ProfessionalProfile } | { status: "notfound" }>({
    status: "loading",
  });

  useEffect(() => {
    setState({ status: "loading" });
    api<ProfessionalProfile>("GET", `/public/professionals/${slug}`)
      .then((data) => setState({ status: "ok", data }))
      .catch(() => setState({ status: "notfound" }));
  }, [slug]);

  const profile = state.status === "ok" ? state.data : null;

  useDocumentHead({
    title: profile ? profile.fullName : "Professional profile",
    description: profile
      ? (profile.headline ?? `${profile.fullName}'s governance profile on Bord.`) +
        (profile.positions.length ? ` Serves at ${profile.positions.map((p) => p.entityName).join(", ")}.` : "")
      : "Governance professional profile.",
    path: `/professionals/${slug}`,
    type: "profile",
    noindex: state.status !== "ok",
    jsonLd: profile
      ? [
          {
            "@context": "https://schema.org",
            "@type": "Person",
            name: profile.fullName,
            description: profile.headline ?? undefined,
            url: window.location.origin + `/professionals/${profile.publicSlug}`,
            memberOf: profile.positions.map((p) => ({ "@type": "Organization", name: p.entityName })),
          },
          breadcrumbJsonLd(
            [{ label: "Home", path: "/" }, { label: "Professionals", path: "/professionals" }, { label: profile.fullName }],
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
      <Breadcrumbs items={[{ label: "Home", path: "/" }, { label: "Professionals", path: "/professionals" }, { label: profile!.fullName }]} />
      <h1>{profile!.fullName}</h1>
      {profile!.headline && <p className="hero-lede">{profile!.headline}</p>}
      {profile!.bio && <p>{profile!.bio}</p>}

      <h2>Board positions</h2>
      {profile!.positions.length === 0 ? (
        <p className="subtle">No public positions listed.</p>
      ) : (
        <ul className="position-list">
          {profile!.positions.map((p, i) => (
            <li key={i} className="card">
              <strong>{p.role.replace(/_/g, " ")}</strong>
              {" at "}
              <Link to={`/companies/${p.entitySlug}`}>{p.entityName}</Link>
              <p className="subtle">
                {new Date(p.startDate).getFullYear()}
                {p.endDate ? `–${new Date(p.endDate).getFullYear()}` : "–present"} · {p.entityType.replace(/_/g, " ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </PublicLayout>
  );
}
