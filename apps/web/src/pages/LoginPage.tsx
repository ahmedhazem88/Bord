import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

type Step = "credentials" | "mfa_token" | "mfa_enroll" | "mfa_confirm";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState("");
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [enrollSecret, setEnrollSecret] = useState<string | null>(null);
  const [otpAuthUrl, setOtpAuthUrl] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const resp = await api<{ token: string }>("POST", "/auth/login", { email, password });
      login(resp.token);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError && err.body && typeof err.body === "object") {
        const body = err.body as { error?: string; setupToken?: string };
        if (body.error === "mfa_token_required") {
          setStep("mfa_token");
        } else if (body.error === "mfa_enrollment_required" && body.setupToken) {
          setSetupToken(body.setupToken);
          setStep("mfa_enroll");
        } else {
          setError(body.error ?? "login failed");
        }
      } else {
        setError("login failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitMfaToken(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const resp = await api<{ token: string }>("POST", "/auth/login", { email, password, mfaToken });
      login(resp.token);
      navigate("/");
    } catch {
      setError("invalid code");
    } finally {
      setBusy(false);
    }
  }

  async function startEnroll() {
    setError(null);
    setBusy(true);
    try {
      const resp = await api<{ secret: string; otpAuthUrl: string }>("POST", "/auth/mfa/enroll", undefined, setupToken ?? undefined);
      setEnrollSecret(resp.secret);
      setOtpAuthUrl(resp.otpAuthUrl);
      setStep("mfa_confirm");
    } catch {
      setError("could not start enrollment");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("POST", "/auth/mfa/confirm", { token: confirmCode }, setupToken ?? undefined);
      setStep("mfa_token");
      setError(null);
    } catch {
      setError("invalid code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="centered-page">
      <div className="card auth-card">
        <h2>Bord</h2>
        <p className="subtle">Governance platform for FRA-regulated entities</p>
        <hr className="hairline-divider" />

        {step === "credentials" && (
          <form onSubmit={submitCredentials}>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button className="btn" type="submit" disabled={busy}>
              Sign in
            </button>
            <p className="subtle" style={{ marginTop: 12 }}>
              <Link to="/register">Create an account</Link>
            </p>
          </form>
        )}

        {step === "mfa_token" && (
          <form onSubmit={submitMfaToken}>
            <p className="subtle">Enter your 6-digit authenticator code.</p>
            <div className="field">
              <label>Authentication code</label>
              <input value={mfaToken} onChange={(e) => setMfaToken(e.target.value)} maxLength={6} required />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button className="btn" type="submit" disabled={busy}>
              Verify
            </button>
          </form>
        )}

        {step === "mfa_enroll" && (
          <div>
            <p className="subtle">
              Your role requires multi-factor authentication (spec section 9.2). Set up an authenticator app to continue.
            </p>
            {error && <p className="error-text">{error}</p>}
            <button className="btn" onClick={startEnroll} disabled={busy}>
              Start MFA setup
            </button>
          </div>
        )}

        {step === "mfa_confirm" && (
          <form onSubmit={confirmEnroll}>
            <p className="subtle">Scan this into your authenticator app, or enter the secret manually:</p>
            <code style={{ wordBreak: "break-all", fontSize: 12 }}>{enrollSecret}</code>
            <p className="subtle" style={{ wordBreak: "break-all" }}>
              {otpAuthUrl}
            </p>
            <div className="field">
              <label>Confirm 6-digit code</label>
              <input value={confirmCode} onChange={(e) => setConfirmCode(e.target.value)} maxLength={6} required />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button className="btn" type="submit" disabled={busy}>
              Confirm & continue to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
