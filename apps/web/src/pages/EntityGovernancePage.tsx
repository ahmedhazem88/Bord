import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Callout, StatusLabel } from "../components/StatusLabel";
import { useDocumentHead } from "../hooks/useDocumentHead";
import { EntityPublicProfileCard } from "../components/EntityPublicProfileCard";

interface Capacity {
  id: string;
  role: string;
  active: boolean;
  verificationStatus: string;
  user: { id: string; fullName: string; email: string };
}

interface ValidationResult {
  valid: boolean;
  violations: string[];
}

interface Resolution {
  id: string;
  type: string;
  title: string;
  status: string;
  effectBasis: string;
  resolutionDate: string | null;
}

const BOARD_ROLES = [
  "CHAIRMAN",
  "VICE_CHAIRMAN",
  "MANAGING_DIRECTOR",
  "CORPORATE_SECRETARY",
  "EXECUTIVE_BOARD_MEMBER",
  "NON_EXECUTIVE_BOARD_MEMBER",
  "INDEPENDENT_BOARD_MEMBER",
  "COMPLIANCE_OFFICER",
];

export function EntityGovernancePage() {
  const { entityId = "" } = useParams();
  const { decoded } = useAuth();

  const [capacities, setCapacities] = useState<Capacity[] | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [pending, setPending] = useState<Resolution[] | null>(null);
  const [finalizeMessage, setFinalizeMessage] = useState<string | null>(null);

  const [seedUserId, setSeedUserId] = useState("");
  const [seedRole, setSeedRole] = useState(BOARD_ROLES[0]);
  const [seedError, setSeedError] = useState<string | null>(null);

  useDocumentHead({
    title: "Governance structure",
    description: "Board composition, capacities, and pending resolutions for this entity.",
    path: `/entities/${entityId}`,
    noindex: true,
  });

  async function refresh() {
    const [caps, val, pend] = await Promise.all([
      api<Capacity[]>("GET", `/entities/${entityId}/capacities`),
      api<ValidationResult>("GET", `/entities/${entityId}/governance/board/validate`),
      api<Resolution[]>("GET", `/entities/${entityId}/resolutions/pending`),
    ]);
    setCapacities(caps);
    setValidation(val);
    setPending(pend);
  }

  useEffect(() => {
    refresh().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  async function finalize() {
    setFinalizeMessage(null);
    try {
      await api("POST", `/entities/${entityId}/governance/board/finalize`);
      setFinalizeMessage("Board structure finalized.");
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.body && typeof err.body === "object" && "violations" in err.body) {
        setFinalizeMessage("Cannot finalize: composition violations remain.");
      } else {
        setFinalizeMessage(err instanceof ApiError ? err.message : "finalize failed");
      }
    }
  }

  async function seedCapacity(e: React.FormEvent) {
    e.preventDefault();
    setSeedError(null);
    try {
      await api("POST", `/entities/${entityId}/governance/board/seed-initial-capacity`, { userId: seedUserId, role: seedRole });
      setSeedUserId("");
      await refresh();
    } catch (err) {
      setSeedError(err instanceof ApiError ? err.message : "seeding failed");
    }
  }

  return (
    <div>
      <h2>Governance structure</h2>

      {validation && !validation.valid && (
        <Callout label="Action Needed">
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            {validation.violations.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </Callout>
      )}
      {validation && validation.valid && (
        <div style={{ marginBottom: 16 }}>
          <StatusLabel label="Board composition compliant" />
        </div>
      )}

      <table className="flat-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Verification</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {capacities?.map((c) => (
            <tr key={c.id}>
              <td>{c.user.fullName}</td>
              <td>{c.role}</td>
              <td>{c.verificationStatus}</td>
              <td>{c.active ? <StatusLabel label="Active" /> : <StatusLabel label="Inactive" blocking />}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {capacities?.length === 0 && <p className="subtle">No active capacities at this entity yet.</p>}

      <button className="btn" style={{ marginTop: 16 }} onClick={finalize}>
        Finalize board structure
      </button>
      {finalizeMessage && <p className="subtle">{finalizeMessage}</p>}

      <hr className="hairline-divider" />

      <h3>Pending changes</h3>
      <p className="subtle">Authorization-effective resolutions awaiting GAFI ratification (PRD section 5.4).</p>
      <table className="flat-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Effect basis</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {pending?.map((r) => (
            <tr key={r.id}>
              <td>{r.title}</td>
              <td>{r.type}</td>
              <td>{r.effectBasis}</td>
              <td>
                <StatusLabel label={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {pending?.length === 0 && <p className="subtle">Nothing pending authorization.</p>}

      {capacities?.some((c) => c.user.id === decoded?.sub && c.role === "COMPLIANCE_OFFICER" && c.active) && (
        <>
          <hr className="hairline-divider" />
          <EntityPublicProfileCard entityId={entityId} />
        </>
      )}

      {decoded?.isPlatformAdmin && (
        <>
          <hr className="hairline-divider" />
          <h3>Bootstrap: seed initial capacity</h3>
          <p className="subtle">
            Only available before the board has passed composition validation once — the server rejects this once that
            window has closed.
          </p>
          <form onSubmit={seedCapacity}>
            <div className="field">
              <label>
                User ID
                <input value={seedUserId} onChange={(e) => setSeedUserId(e.target.value)} required />
              </label>
            </div>
            <div className="field">
              <label>
                Role
                <select value={seedRole} onChange={(e) => setSeedRole(e.target.value)}>
                  {BOARD_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {seedError && <p className="error-text">{seedError}</p>}
            <button className="btn btn-secondary" type="submit">
              Seed capacity
            </button>
          </form>
        </>
      )}
    </div>
  );
}
