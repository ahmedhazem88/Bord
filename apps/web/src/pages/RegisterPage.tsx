import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";

export function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

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
          <p className="subtle">Account created. Redirecting to sign in…</p>
        ) : (
          <form onSubmit={submit}>
            <div className="field">
              <label>Full name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>Password (min 12 characters)</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} />
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
