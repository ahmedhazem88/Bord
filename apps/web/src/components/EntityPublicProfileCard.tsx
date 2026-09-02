import { useEffect, useState } from "react";
import { api } from "../api/client";

interface EntityPublicProfile {
  publicSlug: string | null;
  publiclyListed: boolean;
  about: string | null;
  website: string | null;
}

/**
 * Entity-side counterpart to PublicProfileCard, scoped to Compliance
 * Officers (matching PUT /entities/:id/public-profile's requireRole guard).
 * publiclyListed defaults to true — an FRA-regulated entity's identity is
 * public record regardless — so this mostly controls the "about" copy and
 * offers the opt-out for entities that don't want a discoverable page.
 */
export function EntityPublicProfileCard({ entityId }: { entityId: string }) {
  const [profile, setProfile] = useState<EntityPublicProfile | null>(null);
  const [listed, setListed] = useState(true);
  const [about, setAbout] = useState("");
  const [website, setWebsite] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    api<EntityPublicProfile>("GET", `/entities/${entityId}/public-profile`).then((p) => {
      setProfile(p);
      setListed(p.publiclyListed);
      setAbout(p.about ?? "");
      setWebsite(p.website ?? "");
    });
  }, [entityId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setJustSaved(false);
    try {
      const updated = await api<EntityPublicProfile>("PUT", `/entities/${entityId}/public-profile`, {
        publiclyListed: listed,
        about: about.trim() || null,
        website: website.trim() || null,
      });
      setProfile(updated);
      setJustSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return null;

  return (
    <div className="card">
      <h3>Public company profile</h3>
      <p className="subtle">
        Listed by default — this entity's identity is public record with the FRA regardless. Turning this off removes its
        page from Bord's public companies directory; board minutes, votes, and remuneration are never shown here either way.
      </p>

      <form onSubmit={save}>
        <label className="toggle-row">
          <input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} />
          <span>{listed ? "Listed in the public directory" : "Not listed"}</span>
        </label>

        {listed && (
          <>
            <div className="field">
              <label>
                About
                <textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={3} maxLength={4000} />
              </label>
            </div>
            <div className="field">
              <label>
                Website
                <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
              </label>
            </div>
          </>
        )}

        <div className="profile-card-actions">
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          {justSaved && !saving && <span className="subtle">Saved.</span>}
          {profile.publicSlug && profile.publiclyListed && (
            <a href={`/companies/${profile.publicSlug}`} target="_blank" rel="noopener noreferrer">
              View public page →
            </a>
          )}
        </div>
      </form>
    </div>
  );
}
