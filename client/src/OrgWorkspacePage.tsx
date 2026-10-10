import type { ReactNode } from "react";
import { OrgBanner } from "./orgs";

type OrgWorkspacePageProps = {
  eyebrow: string;
  title: string;
  tagline?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

export function OrgWorkspacePage({ eyebrow, title, tagline, actions, children }: OrgWorkspacePageProps) {
  return (
    <div className="reviews vbs-workspace">
      <header className="vbs-workspace-head page-head">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <OrgBanner />
        {tagline ? <p className="tagline">{tagline}</p> : null}
        {actions ? <div className="vbs-workspace-actions">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}
