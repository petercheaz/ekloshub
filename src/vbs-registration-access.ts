import { db } from "./db/pool.js";
import {
  canConfigureCookingTeam,
  canManageRegistration,
  canViewRegistrationAllergies,
  canViewRegistrationContacts,
  type OrgRole,
} from "./org-permissions.js";
import type { VbsRegistrationStudent } from "./vbs-registration.js";

function parseMemberList(raw: string) {
  return [...new Set(raw.split(/[,;]+/).map((item) => item.trim()).filter(Boolean))];
}

export async function resolveCookingTeamId(organizationId: string) {
  const org = await db().query<{ cooking_team_id: string | null }>(
    `SELECT cooking_team_id FROM organizations WHERE id = $1`,
    [organizationId],
  );
  const configured = org.rows[0]?.cooking_team_id?.trim();
  if (configured) {
    return configured;
  }
  const fallback = await db().query<{ id: string }>(
    `SELECT id FROM org_teams
     WHERE organization_id = $1
       AND (LOWER(name) LIKE '%snack%' OR LOWER(name) LIKE '%cook%' OR LOWER(name) LIKE '%kitchen%')
     ORDER BY name
     LIMIT 1`,
    [organizationId],
  );
  return fallback.rows[0]?.id ?? "";
}

export async function isCookingTeamParticipant(organizationId: string, username: string) {
  const teamId = await resolveCookingTeamId(organizationId);
  if (!teamId) {
    return false;
  }
  const team = await db().query<{ members: string; team_admin_username: string | null }>(
    `SELECT members, team_admin_username FROM org_teams WHERE id = $1 AND organization_id = $2`,
    [teamId, organizationId],
  );
  const row = team.rows[0];
  if (!row) {
    return false;
  }
  if (row.team_admin_username === username) {
    return true;
  }
  return parseMemberList(row.members).includes(username);
}

export function registrationViewFlags(
  role: OrgRole,
  platformAdmin: boolean,
  cookingTeamParticipant: boolean,
) {
  const canViewContacts = canViewRegistrationContacts(role, platformAdmin);
  const canViewAllergies = canViewRegistrationAllergies(role, cookingTeamParticipant, platformAdmin);
  const canConfigureCooking = canConfigureCookingTeam(role, platformAdmin);
  const canWrite = canManageRegistration(role) || platformAdmin;
  return {
    canViewContacts,
    canViewAllergies,
    canConfigureCooking,
    canWrite,
    cookingTeamParticipant,
  };
}

export function sanitizeRegistrationStudent(
  student: VbsRegistrationStudent,
  flags: { canViewContacts: boolean; canViewAllergies: boolean },
): VbsRegistrationStudent {
  return {
    ...student,
    contact1Name: flags.canViewContacts ? student.contact1Name : "",
    contact1Phone: flags.canViewContacts ? student.contact1Phone : "",
    contact1Email: flags.canViewContacts ? student.contact1Email : "",
    contact2Name: flags.canViewContacts ? student.contact2Name : "",
    contact2Phone: flags.canViewContacts ? student.contact2Phone : "",
    contact2Email: flags.canViewContacts ? student.contact2Email : "",
    comments: flags.canViewContacts ? student.comments : "",
    allergiesCommon: flags.canViewAllergies ? student.allergiesCommon : [],
    allergiesOther: flags.canViewAllergies ? student.allergiesOther : "",
  };
}
