import { OrgMessagesPanel } from "../OrgMessagesPanel";
import { OrgBanner, useOrgs } from "../orgs";

export default function MessagesPage() {
  const { tenantId } = useOrgs();

  return (
    <div className="messages-page">
      <p className="eyebrow">Inbox</p>
      <h1>Direct Message</h1>
      <OrgBanner />
      <OrgMessagesPanel key={tenantId ?? "global"} />
    </div>
  );
}
