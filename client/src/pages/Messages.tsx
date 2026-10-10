import { OrgMessagesPanel } from "../OrgMessagesPanel";
import { OrgWorkspacePage } from "../OrgWorkspacePage";
import { useOrgs } from "../orgs";

export default function MessagesPage() {
  const { tenantId } = useOrgs();

  return (
    <OrgWorkspacePage
      eyebrow="Inbox"
      title="Direct Message"
      tagline="Search teammates by name or email. Team threads reach everyone on that roster."
    >
      <section className="vbs-panel">
        <OrgMessagesPanel key={tenantId ?? "global"} embedded />
      </section>
    </OrgWorkspacePage>
  );
}
