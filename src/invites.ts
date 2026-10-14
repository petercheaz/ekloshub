import bcrypt from "bcryptjs";
import { db } from "./db/pool.js";
import { sendMail } from "./mail.js";
import { addNotification } from "./notifications.js";
import { canManageOrgMembers, getMembership, isOrgRole } from "./orgs.js";
import { isPlatformAdmin } from "./users.js";
import { findUserByEmail, updateProfile } from "./users.js";

const appUrl = (process.env.APP_PUBLIC_URL ?? "http://localhost:5173").replace(/\/$/, "");

export type OrgInvite = {
  id: string;
  email: string;
  token: string;
  keyword: string;
  link: string;
  createdAt: string;
  acceptedAt: string | null;
};

type InviteRow = {
  id: string;
  organization_id: string;
  email: string;
  token: string;
  secret_hash: string;
  keyword: string;
  created_at: Date;
  accepted_at: Date | null;
};

function inviteLink(token: string, email: string) {
  return `${appUrl}/invite/${token}?email=${encodeURIComponent(email)}`;
}

function present(row: InviteRow): OrgInvite {
  return {
    id: row.id,
    email: row.email,
    token: row.token,
    keyword: row.accepted_at ? "" : row.keyword,
    link: inviteLink(row.token, row.email),
    createdAt: row.created_at.toISOString(),
    acceptedAt: row.accepted_at ? row.accepted_at.toISOString() : null,
  };
}

function parseEmails(value: string) {
  return [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.includes("@")),
    ),
  ];
}

function makeKeyword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export async function listInvites(organizationId: string) {
  const result = await db().query<InviteRow>(
    `SELECT id, organization_id, email, token, secret_hash, keyword, created_at, accepted_at
     FROM org_invites
     WHERE organization_id = $1
     ORDER BY created_at DESC`,
    [organizationId],
  );
  return result.rows.map(present);
}

export async function createInvites(
  organizationId: string,
  actor: string,
  rawEmails: string,
  roleInput = "org_read",
) {
  const membership = await getMembership(organizationId, actor);
  const platformAdmin = await isPlatformAdmin(actor);
  if (!platformAdmin && (!membership || !canManageOrgMembers(membership.role))) {
    return { error: "Only org admins or registration admins can send invites" as const };
  }
  const emails = parseEmails(rawEmails);
  if (emails.length === 0) {
    return { error: "Enter at least one email address" as const };
  }
  const inviteRole = isOrgRole(roleInput) ? roleInput : "org_read";
  if (inviteRole === "org_admin") {
    return { error: "Invites cannot grant org admin; add admins from Manage Org after they join" as const };
  }
  if (inviteRole === "registration_admin") {
    return { error: "Assign registration admin from Manage Org after they join" as const };
  }
  if (inviteRole === "org_team_admin") {
    return { error: "Assign team admin from Manage Org after they join" as const };
  }
  const org = await db().query<{ name: string }>("SELECT name FROM organizations WHERE id = $1", [organizationId]);
  const orgName = org.rows[0]?.name;
  if (!orgName) {
    return { error: "Organization not found" as const };
  }

  const sent: OrgInvite[] = [];
  for (const email of emails) {
    const keyword = makeKeyword();
    const token = crypto.randomUUID();
    const id = crypto.randomUUID();
    const secretHash = bcrypt.hashSync(keyword, 10);
    await db().query(
      `INSERT INTO org_invites (
        id, organization_id, email, token, secret_hash, keyword, invited_by, created_at, role
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, organizationId, email, token, secretHash, keyword, actor, new Date().toISOString(), inviteRole],
    );
    const link = inviteLink(token, email);
    const text = [
      `You are invited to join ${orgName} on VBS Resources.`,
      ``,
      `Open this link: ${link}`,
      `Enter this keyword: ${keyword}`,
      ``,
      `Add your first name, last name, and phone number to join.`,
    ].join("\n");
    await sendMail(email, `Invite to ${orgName}`, text);
    const existing = await findUserByEmail(email);
    if (existing) {
      await addNotification(
        existing,
        `Invite to ${orgName}`,
        `You were invited to join ${orgName}. Open the link and enter the keyword from your email.`,
        `/invite/${token}?email=${encodeURIComponent(email)}`,
      );
    }
    sent.push({
      id,
      email,
      token,
      keyword,
      link,
      createdAt: new Date().toISOString(),
      acceptedAt: null,
    });
  }
  return { invites: sent };
}

export async function getInvite(token: string, email: string) {
  const result = await db().query<InviteRow & { org_name: string }>(
    `SELECT i.id, i.organization_id, i.email, i.token, i.secret_hash, i.keyword, i.created_at, i.accepted_at, o.name AS org_name
     FROM org_invites i
     JOIN organizations o ON o.id = i.organization_id
     WHERE i.token = $1`,
    [token],
  );
  const invite = result.rows[0];
  if (!invite) {
    return { error: "Invite not found" as const };
  }
  const requested = email.trim().toLowerCase();
  if (requested && requested !== invite.email) {
    return { error: "This invite is for a different email" as const };
  }
  return {
    organizationName: invite.org_name,
    email: invite.email,
    existingUser: Boolean(await findUserByEmail(invite.email)),
    accepted: Boolean(invite.accepted_at),
  };
}

export async function acceptInvite(
  token: string,
  input: { email: string; secret: string; firstName: string; lastName: string; phone: string; password: string },
) {
  const email = input.email.trim().toLowerCase();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const phone = input.phone.trim();
  if (!email || !input.secret.trim() || !firstName || !lastName || !phone) {
    return { error: "Email, keyword, name, last name, and phone are required" as const };
  }

  const result = await db().query<InviteRow & { role: string }>(
    `SELECT id, organization_id, email, token, secret_hash, keyword, created_at, accepted_at, role
     FROM org_invites
     WHERE token = $1`,
    [token],
  );
  const invite = result.rows[0];
  if (!invite || invite.email !== email) {
    return { error: "Invite not found" as const };
  }
  if (invite.accepted_at) {
    return { error: "This invite was already used" as const };
  }
  if (!bcrypt.compareSync(input.secret.trim(), invite.secret_hash)) {
    return { error: "Keyword does not match" as const };
  }

  let username = await findUserByEmail(email);
  if (!username) {
    const password = input.password;
    if (!password || password.length < 6) {
      return { error: "Choose a password with at least 6 characters" as const };
    }
    username = email;
    await db().query(
      `INSERT INTO users (username, password_hash, verified, platform_admin, email, first_name, last_name, phone, vbs_default_all_filters)
       VALUES ($1,$2,FALSE,FALSE,$3,$4,$5,$6,TRUE)`,
      [username, bcrypt.hashSync(password, 10), email, firstName, lastName, phone],
    );
  } else {
    await updateProfile(username, { email, firstName, lastName, phone });
  }

  const memberRole = isOrgRole(invite.role) ? invite.role : "org_read";
  await db().query(
    `INSERT INTO organization_members (organization_id, username, role)
     VALUES ($1,$2,$3)
     ON CONFLICT (organization_id, username) DO NOTHING`,
    [invite.organization_id, username, memberRole],
  );
  await db().query("UPDATE org_invites SET accepted_at = NOW() WHERE id = $1", [invite.id]);
  return { username, organizationId: invite.organization_id };
}
