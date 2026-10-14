/**
 * Organization RBAC (per-tenant). Platform admins bypass membership checks in route helpers
 * that explicitly test `isPlatformAdmin` (tenant header routes, org APIs, etc.).
 *
 * | Role                 | Plan & tasks   | Registration | Roster/invites | Teams config | Org delete |
 * |----------------------|----------------|--------------|----------------|--------------|------------|
 * | org_admin            | read + write   | full         | full           | full         | yes        |
 * | registration_admin   | read only*     | full         | full           | —            | —          |
 * | org_write            | read + write   | read         | —              | —            | —          |
 * | org_team_admin       | read + team†   | read         | —              | —            | —          |
 * | org_read             | read + limited‡| read         | —              | —            | —          |
 *
 * * Coordinators (org_write) edit the VBS plan; registration is a separate duty (registration_admin).
 * † Team admins edit tasks/posts for their teams; org-wide plan fields need org_write or org_admin.
 * ‡ org_read may update tasks assigned to them and post to their teams (see vbs-plan / board).
 *
 * Global tenant-scoped content (reviews, share, setup, messages via X-Tenant-Id): org_write + org_admin.
 * Room design / Photoshoppe edits: same as plan write (org_write + org_admin).
 */

export const orgRoles = [
  "org_admin",
  "registration_admin",
  "org_team_admin",
  "org_write",
  "org_read",
] as const;

export type OrgRole = (typeof orgRoles)[number];

export const orgRoleLabels: Record<OrgRole, string> = {
  org_admin: "Org admin — full access for this church",
  registration_admin: "Registration admin — students, nametags, and member roster",
  org_team_admin: "Team admin — contact & board for assigned teams",
  org_write: "Coordinator — edit VBS plan, calendar, and org workspace content",
  org_read: "Viewer — read plan; limited edits on assigned work",
};

/** Roles grantable via email invite (promote sensitive roles in Manage Org). */
export const inviteableRoles: OrgRole[] = ["org_read", "org_write"];

export function isOrgRole(value: string): value is OrgRole {
  return orgRoles.includes(value as OrgRole);
}

/** VBS plan, worksheet, schedule, and tenant API writes (reviews/share/setup/messages). */
export function canWriteRole(role: OrgRole | null) {
  return role === "org_admin" || role === "org_write";
}

export function canContactOrg(role: OrgRole | null) {
  return role === "org_admin" || role === "org_team_admin";
}

export function canManageOrg(role: OrgRole | null) {
  return role === "org_admin";
}

export function canManageTeams(role: OrgRole | null) {
  return role === "org_admin";
}

/** Manage org roster (add/remove users, change roles, send invites). */
export function canManageOrgMembers(role: OrgRole | null) {
  return role === "org_admin" || role === "registration_admin";
}

/** Student registration CRUD and nametag generation. */
export function canManageRegistration(role: OrgRole | null) {
  return role === "org_admin" || role === "registration_admin";
}

/** Emergency contacts and pickup phones in registration. */
export function canViewRegistrationContacts(role: OrgRole | null, platformAdmin = false) {
  return platformAdmin || canManageRegistration(role) || role === "org_write";
}

/** Allergy roster and cooking/snacks tools (also granted via cooking team roster). */
export function canViewRegistrationAllergies(
  role: OrgRole | null,
  cookingTeamParticipant: boolean,
  platformAdmin = false,
) {
  return canViewRegistrationContacts(role, platformAdmin) || cookingTeamParticipant;
}

/** Pick which org team is the cooking/snacks team. */
export function canConfigureCookingTeam(role: OrgRole | null, platformAdmin = false) {
  return platformAdmin || canManageRegistration(role);
}

/** Room design, Photoshoppe saves, and other creative org libraries. */
export function canUseOrgEditors(role: OrgRole | null) {
  return canWriteRole(role);
}

/** See every team in dropdowns (registration, admin tools). */
export function hasOrgWideTeamAccess(role: OrgRole | null, platformAdmin = false) {
  return platformAdmin || role === "org_admin" || role === "registration_admin";
}

export function roleRank(role: OrgRole) {
  const order: OrgRole[] = [
    "org_read",
    "org_team_admin",
    "org_write",
    "registration_admin",
    "org_admin",
  ];
  return order.indexOf(role);
}

/** Roles that must not be auto-changed when assigning VBS team admin duties. */
export function isProtectedFromTeamAdminPromotion(role: OrgRole) {
  return role === "org_admin" || role === "registration_admin";
}
