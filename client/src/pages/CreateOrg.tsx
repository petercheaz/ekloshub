import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { OrgWorkspacePage } from "../OrgWorkspacePage";
import { useOrgs } from "../orgs";

export default function CreateOrgPage() {
  const navigate = useNavigate();
  const { refreshOrgs } = useOrgs();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const org = await api.createOrganization({ name, address, contact });
      await refreshOrgs();
      navigate(`/org/${org.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create organization");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OrgWorkspacePage
      eyebrow="New tenant"
      title="Create Organization"
      tagline="You will be the org admin. Members only see this organization's reviews, shares, setups, and messages."
    >
      <form className="review-form share-form vbs-form-panel" onSubmit={(event) => void onSubmit(event)}>
        <label htmlFor="org-name">Org/Church Name</label>
        <input id="org-name" value={name} onChange={(event) => setName(event.target.value)} required />
        <label htmlFor="org-address">Address</label>
        <input id="org-address" value={address} onChange={(event) => setAddress(event.target.value)} required />
        <label htmlFor="org-contact">Contact</label>
        <input id="org-contact" value={contact} onChange={(event) => setContact(event.target.value)} required />
        {error ? <p className="error">{error}</p> : null}
        <div className="vbs-form-actions">
          <button type="submit" className="vbs-plan-save" disabled={submitting}>
            {submitting ? "Creating…" : "Create organization"}
          </button>
        </div>
      </form>
    </OrgWorkspacePage>
  );
}
