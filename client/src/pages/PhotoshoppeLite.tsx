import { useParams } from "react-router-dom";
import { OrgWorkspacePage } from "../OrgWorkspacePage";
import { PhotoshoppeWorkspace } from "../photoshoppe/PhotoshoppeWorkspace";

export default function PhotoshoppeLitePage() {
  const { orgId = "local" } = useParams();
  const storageKey = orgId ? `photoshoppe-lite:${orgId}` : undefined;

  return (
    <OrgWorkspacePage eyebrow="Org workspace" title="Photoshoppe Lite">
      <PhotoshoppeWorkspace orgId={orgId} storageKey={storageKey} />
    </OrgWorkspacePage>
  );
}
