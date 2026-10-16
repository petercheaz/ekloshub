import { defaultCurriculumYear, programs, publishers, type PublisherId } from "./curriculum.js";
import { db } from "./db/pool.js";
import { buildSnacksMenuPrompt, buildSnacksMenuRegeneratePrompt, generateLlmText } from "./llm-images.js";
import {
  mergeSnacksMenu,
  normalizeRegenerateDays,
  parseSnacksMenuByDay,
  SNACK_MENU_DAYS,
  type SnackMenuDayId,
} from "./vbs-snacks-menu-days.js";
import { getMembership } from "./orgs.js";
import {
  canConfigureCookingTeam,
  canViewRegistrationAllergies,
  type OrgRole,
} from "./org-permissions.js";
import { publisherName } from "./setup.js";
import { isPlatformAdmin } from "./users.js";
import { isCookingTeamParticipant, resolveCookingTeamId } from "./vbs-registration-access.js";
import { getActiveVbsYear, parseSeasonYear } from "./vbs-org-season.js";
import {
  COMMON_REGISTRATION_ALLERGIES,
  formatAllergiesSummary,
  type RegistrationRow,
} from "./vbs-registration.js";

const publisherIds = new Set(publishers.map((publisher) => publisher.id));

function isPublisher(id: string): id is PublisherId {
  return publisherIds.has(id as PublisherId);
}

async function accessContext(organizationId: string, username: string) {
  const platformAdmin = await isPlatformAdmin(username);
  const membership = await getMembership(organizationId, username);
  if (!membership && !platformAdmin) {
    return { error: "Not a member of this organization" as const };
  }
  const role: OrgRole = membership?.role ?? "org_admin";
  const cookingTeamParticipant = await isCookingTeamParticipant(organizationId, username);
  if (!canViewRegistrationAllergies(role, cookingTeamParticipant, platformAdmin)) {
    return { error: "You do not have permission to view allergies or cooking tools" as const };
  }
  return { ok: true as const, role, platformAdmin, cookingTeamParticipant };
}

function buildAllergySummary(rows: RegistrationRow[]) {
  const lines: string[] = [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const summary = formatAllergiesSummary(row.allergies_common ?? [], row.allergies_other);
    if (summary !== "None listed") {
      lines.push(`- ${row.child_full_name}: ${summary}`);
    }
    for (const item of row.allergies_common ?? []) {
      counts.set(item, (counts.get(item) ?? 0) + 1);
    }
    const other = row.allergies_other.trim();
    if (other) {
      counts.set(`Other: ${other}`, (counts.get(`Other: ${other}`) ?? 0) + 1);
    }
  }
  const tally = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => `${label} (${count})`)
    .join("; ");
  const parts = [
    tally ? `Counts: ${tally}` : "No common allergens selected yet.",
    lines.length ? "By child:\n" + lines.join("\n") : "No per-child allergy details beyond counts.",
  ];
  return parts.join("\n\n");
}

export async function getCookingWorkspace(organizationId: string, username: string) {
  const access = await accessContext(organizationId, username);
  if ("error" in access) {
    return access;
  }
  const cookingTeamId = await resolveCookingTeamId(organizationId);
  const menu = await db().query<{ extra_instructions: string; menu_text: string; updated_at: Date }>(
    `SELECT extra_instructions, menu_text, updated_at FROM vbs_registration_snacks_menu WHERE organization_id = $1`,
    [organizationId],
  );
  const row = menu.rows[0];
  const teams = await db().query<{ id: string; name: string }>(
    `SELECT id, name FROM org_teams WHERE organization_id = $1 ORDER BY name`,
    [organizationId],
  );
  return {
    cookingTeamId,
    teams: teams.rows,
    canConfigureCooking: canConfigureCookingTeam(access.role, access.platformAdmin),
    extraInstructions: row?.extra_instructions ?? "",
    menuText: row?.menu_text ?? "",
    menuUpdatedAt: row?.updated_at?.toISOString() ?? "",
    menuDays: SNACK_MENU_DAYS.map((day) => ({
      id: day.id,
      label: day.label,
      body: parseSnacksMenuByDay(row?.menu_text ?? "")[day.id],
    })),
    commonAllergies: [...COMMON_REGISTRATION_ALLERGIES],
  };
}

export async function saveCookingSettings(
  organizationId: string,
  username: string,
  input: { cookingTeamId?: string; extraInstructions?: string },
) {
  const access = await accessContext(organizationId, username);
  if ("error" in access) {
    return access;
  }
  if (typeof input.cookingTeamId === "string" && !canConfigureCookingTeam(access.role, access.platformAdmin)) {
    return { error: "Only registration admins can change the cooking team" as const };
  }
  if (typeof input.cookingTeamId === "string") {
    const teamId = input.cookingTeamId.trim();
    if (teamId) {
      const exists = await db().query(`SELECT 1 FROM org_teams WHERE id = $1 AND organization_id = $2`, [
        teamId,
        organizationId,
      ]);
      if ((exists.rowCount ?? 0) === 0) {
        return { error: "Team not found" as const };
      }
    }
    await db().query(`UPDATE organizations SET cooking_team_id = $2 WHERE id = $1`, [
      organizationId,
      teamId || null,
    ]);
  }
  if (typeof input.extraInstructions === "string") {
    await db().query(
      `INSERT INTO vbs_registration_snacks_menu (organization_id, extra_instructions, menu_text, updated_by, updated_at)
       VALUES ($1, $2, COALESCE((SELECT menu_text FROM vbs_registration_snacks_menu WHERE organization_id = $1), ''), $3, NOW())
       ON CONFLICT (organization_id) DO UPDATE SET extra_instructions = EXCLUDED.extra_instructions, updated_by = $3, updated_at = NOW()`,
      [organizationId, input.extraInstructions.slice(0, 4000), username],
    );
  }
  return getCookingWorkspace(organizationId, username);
}

function formatKeptDaysBlock(kept: { label: string; body: string }[]) {
  if (kept.length === 0) {
    return "";
  }
  return kept
    .map((day) => `### ${day.label} (KEEP)\n${day.body.trim() || "(empty)"}`)
    .join("\n\n");
}

function formatDayHintsBlock(
  regenerateIds: SnackMenuDayId[],
  hints: Partial<Record<SnackMenuDayId, string>>,
) {
  const lines: string[] = [];
  for (const id of regenerateIds) {
    const label = SNACK_MENU_DAYS.find((d) => d.id === id)?.label ?? id;
    const hint = hints[id]?.trim();
    if (hint) {
      lines.push(`- ${label}: ${hint}`);
    }
  }
  return lines.join("\n");
}

export async function generateSnacksMenu(
  organizationId: string,
  username: string,
  input: {
    publisherId: string;
    year: number;
    title: string;
    regenerateDays?: unknown;
    dayHints?: Partial<Record<SnackMenuDayId, string>>;
  },
) {
  const access = await accessContext(organizationId, username);
  if ("error" in access) {
    return access;
  }
  if (!isPublisher(input.publisherId) || !Number.isInteger(input.year) || !input.title.trim()) {
    return { error: "Publisher, year, and VBS title are required" as const };
  }
  const program = programs.find(
    (item) =>
      item.publisherId === input.publisherId && item.year === input.year && item.theme === input.title.trim(),
  );
  if (!program) {
    return { error: "Choose a VBS title that matches the publisher and year" as const };
  }
  const org = await db().query<{ name: string }>(`SELECT name FROM organizations WHERE id = $1`, [organizationId]);
  const { resolveRequestedVbsEvent } = await import("./vbs-event-context.js");
  const viewingEvent = await resolveRequestedVbsEvent(organizationId);
  const year = viewingEvent?.year ?? parseSeasonYear(input.year) ?? (await getActiveVbsYear(organizationId));
  const registrations = await db().query<RegistrationRow>(
    `SELECT child_full_name, allergies_common, allergies_other FROM vbs_registrations
     WHERE organization_id = $1 AND (
       ($3::text IS NOT NULL AND vbs_event_id = $3)
       OR ($3::text IS NULL AND COALESCE(vbs_season_year, $2) = $2)
     )`,
    [organizationId, year, viewingEvent?.id ?? null],
  );
  const menuRow = await db().query<{ extra_instructions: string; menu_text: string }>(
    `SELECT extra_instructions, menu_text FROM vbs_registration_snacks_menu WHERE organization_id = $1`,
    [organizationId],
  );
  const extraInstructions = menuRow.rows[0]?.extra_instructions ?? "";
  const existingText = menuRow.rows[0]?.menu_text ?? "";
  const existingByDay = parseSnacksMenuByDay(existingText);
  const regenerateIds = normalizeRegenerateDays(input.regenerateDays);
  const allDayIds = SNACK_MENU_DAYS.map((d) => d.id);
  const isPartial =
    existingText.trim().length > 0 &&
    regenerateIds.length < allDayIds.length &&
    regenerateIds.length > 0;

  const promptBase = {
    publisher: publisherName(input.publisherId),
    year: input.year,
    title: input.title.trim(),
    organizationName: org.rows[0]?.name ?? "Church",
    allergySummary: buildAllergySummary(registrations.rows),
    studentCount: registrations.rows.length,
    extraInstructions,
  };

  const prompt = isPartial
    ? buildSnacksMenuRegeneratePrompt({
        ...promptBase,
        regenerateDayLabels: regenerateIds.map(
          (id) => SNACK_MENU_DAYS.find((d) => d.id === id)?.label ?? id,
        ),
        keptDaysBlock: formatKeptDaysBlock(
          SNACK_MENU_DAYS.filter((d) => !regenerateIds.includes(d.id)).map((d) => ({
            label: d.label,
            body: existingByDay[d.id],
          })).filter((d) => d.body.trim()),
        ),
        dayHintsBlock: formatDayHintsBlock(regenerateIds, input.dayHints ?? {}),
      })
    : buildSnacksMenuPrompt(promptBase);

  try {
    const llmText = await generateLlmText(prompt);
    let menuText = llmText.trim();
    const fresh = parseSnacksMenuByDay(llmText);
    if (isPartial) {
      const mergedDays = { ...existingByDay };
      for (const id of regenerateIds) {
        if (fresh[id].trim()) {
          mergedDays[id] = fresh[id];
        }
      }
      menuText = mergeSnacksMenu(mergedDays).trim();
      if (!menuText) {
        return { error: "Could not parse regenerated days — try again or regenerate the full week" as const };
      }
    } else if (SNACK_MENU_DAYS.some((day) => fresh[day.id].trim())) {
      menuText = mergeSnacksMenu(fresh).trim();
    }
    await db().query(
      `INSERT INTO vbs_registration_snacks_menu (organization_id, extra_instructions, menu_text, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (organization_id) DO UPDATE SET menu_text = EXCLUDED.menu_text, updated_by = $4, updated_at = NOW()`,
      [organizationId, extraInstructions, menuText, username],
    );
    return {
      menuText,
      generatedAt: new Date().toISOString(),
      regeneratedDays: regenerateIds,
      partial: isPartial,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not generate menu" };
  }
}

export function defaultSnacksCurriculumYear() {
  return defaultCurriculumYear();
}
