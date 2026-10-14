import fs from "node:fs";
import path from "node:path";

/** How much behavior the listed specs actually exercise (honest, not “file exists”). */
export type CoverageDepth = "crud" | "workflow" | "smoke" | "none";

/** Single source of truth for site areas vs E2E specs. Update when you add or deepen tests. */
export type SiteArea = {
  id: string;
  name: string;
  route: string;
  purpose: string;
  depth: CoverageDepth;
  specFiles: string[];
};

export const SITE_AREAS: SiteArea[] = [
  {
    id: "login",
    name: "Sign in",
    route: "/login",
    purpose: "Staff and volunteers sign in with username and password.",
    depth: "workflow",
    specFiles: ["roles-access.spec.ts", "crud-plan.spec.ts", "workflow-org.spec.ts"],
  },
  {
    id: "home",
    name: "Home",
    route: "/",
    purpose: "Landing hub after sign-in and org navigation.",
    depth: "workflow",
    specFiles: ["workflow-content.spec.ts"],
  },
  {
    id: "vbs-plan",
    name: "VBS Plan",
    route: "/org/:id/vbs-plan",
    purpose: "Plan overview, calendar, workbooks, tasks, schedule, stations, milestones, board.",
    depth: "crud",
    specFiles: ["crud-plan.spec.ts", "plan-export.spec.ts", "workflow-org.spec.ts", "roles-access.spec.ts"],
  },
  {
    id: "vbs-reimbursements",
    name: "Reimbursements",
    route: "/org/:id/vbs-plan?tab=reimbursements",
    purpose: "Org admin queue for submitted receipts and reimbursement cycle.",
    depth: "workflow",
    specFiles: ["reimbursement-flow.spec.ts", "roles-access.spec.ts"],
  },
  {
    id: "registration",
    name: "Registration",
    route: "/org/:id/registration",
    purpose: "Student roster, classes, allergies, contacts, roster planning.",
    depth: "crud",
    specFiles: ["crud-registration.spec.ts", "roles-access.spec.ts"],
  },
  {
    id: "public-registration",
    name: "Parent registration (public link)",
    route: "/register/:token",
    purpose: "Parents register a child without an account; offline payment note.",
    depth: "workflow",
    specFiles: ["public-registration.spec.ts", "workflow-profile-notifications.spec.ts"],
  },
  {
    id: "cooking-plan",
    name: "Cooking plan",
    route: "/org/:id/cooking-plan",
    purpose: "Allergy-aware menus and snack planning for VBS week.",
    depth: "workflow",
    specFiles: ["workflow-org.spec.ts"],
  },
  {
    id: "room-design",
    name: "Room design",
    route: "/org/:id/room-design",
    purpose: "AI room ideas and decoration planning.",
    depth: "smoke",
    specFiles: ["workflow-org.spec.ts"],
  },
  {
    id: "messages",
    name: "Messages",
    route: "/org/:id/messages",
    purpose: "Direct messages between org members.",
    depth: "workflow",
    specFiles: ["workflow-org.spec.ts"],
  },
  {
    id: "profile",
    name: "Notification profile",
    route: "/profile",
    purpose: "Email/SMS preferences and contact info for alerts.",
    depth: "workflow",
    specFiles: ["roles-access.spec.ts", "workflow-profile-notifications.spec.ts"],
  },
  {
    id: "notifications-bell",
    name: "In-app notifications",
    route: "(header bell)",
    purpose: "Unread alerts and mark-all-read.",
    depth: "workflow",
    specFiles: ["workflow-profile-notifications.spec.ts"],
  },
  {
    id: "org-manage",
    name: "Manage organization",
    route: "/org/:id/manage",
    purpose: "Org admins manage members, roles, and invites.",
    depth: "smoke",
    specFiles: ["workflow-org.spec.ts"],
  },
  {
    id: "teams",
    name: "Manage teams",
    route: "/org/:id/teams",
    purpose: "Org admins define teams and team admins.",
    depth: "crud",
    specFiles: ["workflow-org.spec.ts"],
  },
  {
    id: "org-contact",
    name: "Contact church",
    route: "/org/:id/contact",
    purpose: "Members send messages to org leadership.",
    depth: "workflow",
    specFiles: ["workflow-org.spec.ts"],
  },
  {
    id: "reviews",
    name: "Curriculum reviews",
    route: "/org/:id/reviews",
    purpose: "Browse and add publisher program reviews.",
    depth: "workflow",
    specFiles: ["workflow-content.spec.ts"],
  },
  {
    id: "share",
    name: "Share / leftover",
    route: "/org/:id/share",
    purpose: "List and claim shared VBS materials.",
    depth: "workflow",
    specFiles: ["workflow-content.spec.ts"],
  },
  {
    id: "setup",
    name: "Setup photos",
    route: "/org/:id/setup",
    purpose: "Setup ideas and photos from past VBS years.",
    depth: "crud",
    specFiles: ["workflow-content.spec.ts"],
  },
  {
    id: "photoshoppe",
    name: "Photoshoppe lite",
    route: "/org/:id/photoshoppe-lite",
    purpose: "Simple graphics editor for VBS artwork.",
    depth: "workflow",
    specFiles: ["workflow-org.spec.ts"],
  },
  {
    id: "about",
    name: "About",
    route: "/about",
    purpose: "About VBS Resources.",
    depth: "workflow",
    specFiles: ["workflow-content.spec.ts"],
  },
  {
    id: "rbac",
    name: "Role-based access",
    route: "(multiple)",
    purpose: "Each org role sees the right tabs and admin tools.",
    depth: "workflow",
    specFiles: ["roles-access.spec.ts"],
  },
];

const DEPTH_RANK: Record<CoverageDepth, number> = {
  none: 0,
  smoke: 1,
  workflow: 2,
  crud: 3,
};

export function evaluateSiteCoverage() {
  const specDir = path.join(process.cwd(), "e2e");
  const onDisk = fs.readdirSync(specDir).filter((f) => f.endsWith(".spec.ts"));
  const rows = SITE_AREAS.map((area) => {
    const matched = area.specFiles.filter((f) => onDisk.includes(f));
    const effectiveDepth: CoverageDepth = matched.length === 0 ? "none" : area.depth;
    return {
      ...area,
      covered: matched.length > 0,
      matchedSpecs: matched,
      effectiveDepth,
    };
  });
  const byDepth = {
    crud: rows.filter((r) => r.effectiveDepth === "crud").length,
    workflow: rows.filter((r) => r.effectiveDepth === "workflow").length,
    smoke: rows.filter((r) => r.effectiveDepth === "smoke").length,
    none: rows.filter((r) => r.effectiveDepth === "none").length,
  };
  const highConfidenceAreas = byDepth.crud + byDepth.workflow;
  const coveredCount = rows.filter((r) => r.covered).length;
  const orphanSpecs = onDisk.filter((f) => !SITE_AREAS.some((a) => a.specFiles.includes(f)));
  return {
    rows,
    coveredCount,
    totalAreas: rows.length,
    byDepth,
    highConfidenceAreas,
    onDisk,
    orphanSpecs,
    depthRank: DEPTH_RANK,
  };
}
