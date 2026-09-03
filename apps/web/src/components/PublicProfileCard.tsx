import { useEffect, useState } from "react";
import { api } from "../api/client";

interface UserPublicProfile {
  publicSlug: string | null;
  publicProfileVisible: boolean;
  headline: string | null;
  bio: string | null;
}

/**
 * Self-service publish/withdraw control for the public professional
 * network (apps/api/src/profile/routes.ts). PDPL section 8.4 requires
 * consent to be explicit and freely withdrawable, so this is a plain
 * on/off switch the owner controls directly — no admin step in between.
 */
export function PublicProfileCard() {
  const [profile, setProfile] = useState<UserPublicProfile | null>(null);
  const [visible, setVisible] = useState(false);
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    api<UserPublicProfile>("GET", "/users/me/public-profile").then((p) => {
      setProfile(p);
      setVisible(p.publicProfileVisible);
      setHeadline(p.headline ?? "");
      setBio(p.bio ?? "");
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setJustSaved(false);
    try {
      const updated = await api<UserPublicProfile>("PUT", "/users/me/public-profile", {
        publicProfileVisible: visible,
        headline: headline.trim() || null,
        bio: bio.trim() || null,
      });
      setProfile(updated);
      setJustSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return null;

  const incomplete = visible && !headline.trim();

  return (
    <div className="card">
      <h3>Public profile</h3>
      <p className="subtle">
        Optional. When on, companies browsing Bord's professional directory can find and view this profile — never your board
        minutes, votes, or remuneration.
      </p>

      <form onSubmit={save}>
        <label className="toggle-row">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          <span>{visible ? "Visible in the public directory" : "Not visible — off by default"}</span>
        </label>

        {visible && (
          <>
            <div className="field">
              <label>
                Headline
                <input
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="e.g. Independent Director, Financial Services"
                  maxLength={200}
                />
              </label>
            </div>
            <div className="field">
              <label>
                Bio
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={4000} />
              </label>
            </div>
            {incomplete && <p className="subtle">Add a headline so companies can tell what you do at a glance.</p>}
          </>
        )}

        <div className="profile-card-actions">
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          {justSaved && !saving && <span className="subtle">Saved.</span>}
          {profile.publicSlug && profile.publicProfileVisible && (
            <a href={`/professionals/${profile.publicSlug}`} target="_blank" rel="noopener noreferrer">
              View public profile →
            </a>
          )}
        </div>
      </form>
    </div>
  );
}
