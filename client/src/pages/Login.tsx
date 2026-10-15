import { FormEvent, useState } from "react";
import { BrandLogo } from "../BrandLogo";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth";

export default function LoginPage() {
  const { user, login } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from =
    (location.state as { from?: { pathname: string; search: string } } | null)?.from ?? {
      pathname: "/",
      search: "",
    };

  if (user) {
    return <Navigate to={`${from.pathname}${from.search}`} replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page login-page">
      <div className="login-brand">
        <BrandLogo className="login-logo" />
        <p className="brand-wordmark">EklosHub</p>
      </div>
      <form className="login-card" onSubmit={onSubmit}>
        <h1>Sign in</h1>
        <p className="tagline">Sign in to EklosHub to read and add VBS curriculum reviews.</p>
        <label htmlFor="username">Username or email</label>
        <input
          id="username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
