import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useDocumentHead } from "../hooks/useDocumentHead";
import { PublicProfileCard } from "../components/PublicProfileCard";

interface Entity {
  id: string;
  legalName: string;
  registrationNumber: string;
  entityType: string;
  verificationStatus: string;
}

interface CapacitySummary {
  id: string;
  role: string;
  entity: { id: string; legalName: string };
}

const ENTITY_TYPES = ["INSURANCE", "LEASING", "FACTORING", "MORTGAGE_FINANCE", "MICROFINANCE", "BROKERAGE"];

export function DashboardPage() {
  const { decoded } = useAuth();
  const [entities, setEntities] = useState<Entity[] | null>(null);
  const [capacities, setCapacities] = useState<CapacitySummary[] | null>(null);
  const [legalName, setLegalName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [entityType, setEntityType] = useState(ENTITY_TYPES[0]);
  const [error, setError] = useState<string | null>(null);

  useDocumentHead({
    title: "Dashboard",
    description: "Your entities, capacities, and governance workspace on Bord.",
    path: "/dashboard",
    noindex: true,
  });

  async function refresh() {
    if (decoded?.isPlatformAdmin) {
      setEntities(await api<Entity[]>("GET", "/entities"));
    } else {
      setCapacities(await api<CapacitySummary[]>("GET", "/users/me/capacities"));
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decoded?.isPlatformAdmin]);

  async function createEntity(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("POST", "/entities", { legalName, registrationNumber, entityType });
      setLegalName("");
      setRegistrationNumber("");
      await refresh();
    } catch {
      setError("could not create entity");
    }
  }

  if (decoded?.isPlatformAdmin) {
    return (
      <div>
        <h2>Entities</h2>
        <p className="subtle">Platform Admin onboarding — never grants standing access to an entity's governance data (spec section 2 / 9.10).</p>

        <div className="card">
          <h3>Onboard a new entity</h3>
          <form onSubmit={createEntity}>
            <div className="field">
              <label>
                Legal name
                <input value={legalName} onChange={(e) => setLegalName(e.target.value)} required />
              </label>
            </div>
            <div className="field">
              <label>
                Registration number
                <input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} required />
              </label>
            </div>
            <div className="field">
              <label>
                Entity type
                <select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
                  {ENTITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {error && <p className="error-text">{error}</p>}
            <button className="btn" type="submit">
              Create entity
            </button>
          </form>
        </div>

        <table className="flat-table">
          <thead>
            <tr>
              <th>Legal name</th>
              <th>Registration #</th>
              <th>Type</th>
              <th>Verification</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entities?.map((e) => (
              <tr key={e.id}>
                <td>{e.legalName}</td>
                <td>{e.registrationNumber}</td>
                <td>{e.entityType}</td>
                <td>{e.verificationStatus}</td>
                <td>
                  <Link to={`/entities/${e.id}`}>Open →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <h2>My capacities</h2>
      <table className="flat-table">
        <thead>
          <tr>
            <th>Entity</th>
            <th>Role</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {capacities?.map((c) => (
            <tr key={c.id}>
              <td>{c.entity.legalName}</td>
              <td>{c.role}</td>
              <td>
                <Link to={`/entities/${c.entity.id}`}>Open →</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {capacities?.length === 0 && <p className="subtle">No capacities yet.</p>}

      <PublicProfileCard />
    </div>
  );
}
