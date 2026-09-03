/**
 * Landing-page "see it in action" section — a browser mockup and a phone
 * mockup showing illustrative Bord screens. The two screens shown are
 * deliberately the platform's actual differentiators (agenda items checked
 * against the entity's own governing documents; live quorum-aware voting),
 * not generic dashboard filler — but the content itself is illustrative,
 * not a live screenshot, since this UI doesn't exist in the app yet.
 */
export function DevicePreview() {
  return (
    <section className="device-preview">
      <div className="device-preview-copy">
        <h2>See it in action</h2>
        <p className="subtle">
          Agenda items checked against your Articles of Association and bylaws before they reach the board. Votes cast —
          and quorum tracked — the moment a meeting starts, from a boardroom or a phone.
        </p>
      </div>

      <div className="device-preview-stage">
        <div className="browser-mockup" aria-hidden="true">
          <div className="browser-chrome">
            <span className="browser-dot" />
            <span className="browser-dot" />
            <span className="browser-dot" />
            <span className="browser-url">app.bord.io/entities/nile-leasing</span>
          </div>
          <div className="browser-screen">
            <div className="mock-sidebar">
              <div className="mock-logo">Bord</div>
              <div className="mock-nav-item mock-nav-active">Meetings</div>
              <div className="mock-nav-item">Documents</div>
              <div className="mock-nav-item">Compliance</div>
              <div className="mock-nav-item">Remuneration</div>
            </div>
            <div className="mock-main">
              <p className="mock-eyebrow">Board Meeting · Oct 15, 2026</p>
              <h4 className="mock-heading">Agenda review</h4>

              <div className="mock-agenda-item mock-agenda-flagged">
                <div className="mock-agenda-item-head">
                  <strong>Proposed capital increase</strong>
                  <span className="mock-badge mock-badge-warn">Flagged</span>
                </div>
                <p className="mock-agenda-note">AoA Art. 12 — capital changes require prior GA approval</p>
                <div className="mock-agenda-actions">
                  <span className="mock-btn mock-btn-primary">Confirm</span>
                  <span className="mock-btn mock-btn-ghost">Reject</span>
                </div>
              </div>

              <div className="mock-agenda-item">
                <div className="mock-agenda-item-head">
                  <strong>Approve Q3 minutes</strong>
                  <span className="mock-badge mock-badge-ok">No issues found</span>
                </div>
                <div className="mock-agenda-actions">
                  <span className="mock-btn mock-btn-primary">Confirm</span>
                  <span className="mock-btn mock-btn-ghost">Reject</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="phone-mockup" aria-hidden="true">
          <div className="phone-notch" />
          <div className="phone-screen">
            <p className="mock-eyebrow mock-eyebrow-light">Board Meeting</p>
            <div className="mock-live-chip">
              <span className="mock-live-dot" />
              In session
            </div>

            <h4 className="mock-heading">Appoint Independent Director</h4>
            <p className="mock-agenda-note">Required: board majority</p>

            <div className="mock-tally">
              <span className="mock-tally-for" style={{ width: "71%" }} />
              <span className="mock-tally-against" style={{ width: "14%" }} />
            </div>
            <p className="mock-tally-label">5 For · 1 Against · 1 Abstain</p>

            <div className="mock-vote-buttons">
              <span className="mock-btn mock-btn-primary mock-btn-block">For</span>
              <span className="mock-btn mock-btn-ghost mock-btn-block">Against</span>
              <span className="mock-btn mock-btn-ghost mock-btn-block">Abstain</span>
            </div>

            <p className="mock-quorum-note">Quorum met — 5 of 7 present</p>
          </div>
        </div>
      </div>
    </section>
  );
}
