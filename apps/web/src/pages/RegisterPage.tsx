import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useDocumentHead } from "../hooks/useDocumentHead";

export function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useDocumentHead({
    title: "Create an account",
    description: "Create a Bord account to join a company's board or list your governance profile.",
    path: "/register",
    noindex: true,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("POST", "/auth/register", { email, password, fullName });
      setDone(true);
      setTimeout(() => navigate("/login"), 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "registration failed");
    }
  }

  return (
    <div className="centered-page">
      <div className="card auth-card">
        <h2>Create account</h2>
        {done ? (
          // Peak-End Rule: the flow's final moment is what's remembered — a
          // clear, affirmative state beats a barely-noticeable aside, even
          // though it's on screen for little over a second either way.
          <div className="success-state">
            <span className="status-label">
              <span className="status-dot" />
              Account created
            </span>
            <p className="subtle">Taking you to sign in…</p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="field">
              <label>
                Full name
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </label>
            </div>
            <div className="field">
              <label>
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
            </div>
            <div className="field">
              <label>
                Password (min 12 characters)
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} />
              </label>
            </div>
            {error && <p className="error-text">{error}</p>}
            <button className="btn" type="submit">
              Create account
            </button>
          </form>
        )}
        <hr className="hairline-divider" />
        <Link to="/login">Already have an account? Sign in</Link>
      </div>
    </div>
  );
}
