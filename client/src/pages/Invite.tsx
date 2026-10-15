import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { BrandLogo } from "../BrandLogo";

export default function InvitePage() {
  const { token = "" } = useParams();
  const [params] = useSearchParams();
  const emailFromUrl = params.get("email") ?? "";
  const navigate = useNavigate();
  const { applyUser } = useAuth();
  const [email, setEmail] = useState(emailFromUrl);
  const [secret, setSecret] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [existingUser, setExistingUser] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .invite(token, emailFromUrl)
      .then((data) => {
        if (cancelled) {
          return;
        }
        setOrgName(data.organizationName);
        setEmail(data.email);
        setExistingUser(data.existingUser);
        setAccepted(data.accepted);
        setError(data.accepted ? "This invite was already used" : "");
        setLoading(false);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, emailFromUrl]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const result = await api.acceptInvite(token, {
        email,
        secret,
        firstName,
        lastName,
        phone,
        password,
      });
      applyUser(result);
      navigate(`/org/${result.organizationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join");
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
      <form className="login-card" onSubmit={(event) => void onSubmit(event)}>
        <h1>Join organization</h1>
        <p className="tagline">{loading ? "Loading invite…" : orgName ? `Join ${orgName}` : "Organization invite"}</p>
        <label htmlFor="invite-email">Email</label>
        <input id="invite-email" type="email" value={email} readOnly required />
        <label htmlFor="invite-secret">Keyword</label>
        <input
          id="invite-secret"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          required
        />
        <label htmlFor="invite-first">Name</label>
        <input id="invite-first" value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
        <label htmlFor="invite-last">Last name</label>
        <input id="invite-last" value={lastName} onChange={(event) => setLastName(event.target.value)} required />
        <label htmlFor="invite-phone">Phone number</label>
        <input id="invite-phone" value={phone} onChange={(event) => setPhone(event.target.value)} required />
        {existingUser ? null : (
          <>
            <label htmlFor="invite-password">Password</label>
            <input
              id="invite-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
            />
          </>
        )}
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" disabled={submitting || loading || accepted || !orgName}>
          {submitting ? "Joining…" : "Join organization"}
        </button>
        <p className="tagline">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
