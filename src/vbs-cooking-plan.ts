import { defaultCurriculumYear, programs, publishers, type PublisherId } from "./curriculum.js";
import { db } from "./db/pool.js";
import {
  buildCookingPlanGeneratePrompt,
  buildCookingPlanItemsPrompt,
  extractJsonFromLlm,
  generateLlmText,
} from "./llm-images.js";
import { getMembership } from "./orgs.js";
import { canConfigureCookingTeam, canViewRegistrationAllergies, type OrgRole } from "./org-permissions.js";
import { publisherName } from "./setup.js";
import { isPlatformAdmin } from "./users.js";
import { isCookingTeamParticipant, resolveCookingTeamId } from "./vbs-registration-access.js";
import {
  allMenuItems,
  emptyCookingPlan,
  normalizeCookingPlan,
  type CookingPlanDocument,
  type SnackMenuItem,
} from "./vbs-cooking-plan-types.js";
import { SNACK_MENU_DAYS, type SnackMenuDayId } from "./vbs-snacks-menu-days.js";
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
    return { error: "You do not have permission to view the cooking plan" as const };
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
  return {
    summaryText: [
      tally ? `Counts: ${tally}` : "No common allergens selected yet.",
      lines.length ? "By child:\n" + lines.join("\n") : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    byAllergen: counts,
    studentsWithAllergies: lines.length,
  };
}

async function loadPlanRow(organizationId: string) {
  return db().query<{ extra_instructions: string; menu_json: string; menu_text: string; updated_at: Date }>(
    `SELECT extra_instructions, menu_json, menu_text, updated_at FROM vbs_registration_snacks_menu WHERE organization_id = $1`,
    [organizationId],
  );
}

function planFromRow(menuJson: string, menuText: string) {
  if (menuJson.trim()) {
    try {
      return normalizeCookingPlan(JSON.parse(menuJson));
    } catch {
      /* fall through */
    }
  }
  return emptyCookingPlan();
}

async function savePlan(organizationId: string, username: string, plan: CookingPlanDocument, extraInstructions?: string) {
  const menuJson = JSON.stringify(plan);
  await db().query(
    `INSERT INTO vbs_registration_snacks_menu (organization_id, extra_instructions, menu_text, menu_json, updated_by, updated_at)
     VALUES ($1, COALESCE($2, ''), '', $3, $4, NOW())
     ON CONFLICT (organization_id) DO UPDATE SET
       menu_json = EXCLUDED.menu_json,
       extra_instructions = COALESCE($2, vbs_registration_snacks_menu.extra_instructions),
       updated_by = $4,
       updated_at = NOW()`,
    [organizationId, extraInstructions ?? null, menuJson, username],
  );
}

async function loadAllergyRegistrations(organizationId: string, year: number, eventId?: string | null) {
  return db().query<RegistrationRow>(
    `SELECT child_full_name, allergies_common, allergies_other, class_id FROM vbs_registrations
     WHERE organization_id = $1 AND (
       ($3::text IS NOT NULL AND vbs_event_id = $3)
       OR ($3::text IS NULL AND COALESCE(vbs_season_year, $2) = $2)
     )
     ORDER BY child_full_name`,
    [organizationId, year, eventId ?? null],
  );
}

export async function getCookingPlanWorkspace(
  organizationId: string,
  username: string,
  viewingYear?: number,
) {
  const access = await accessContext(organizationId, username);
  if ("error" in access) {
    return access;
  }
  const cookingTeamId = await resolveCookingTeamId(organizationId);
  const menu = await loadPlanRow(organizationId);
  const row = menu.rows[0];
  const plan = planFromRow(row?.menu_json ?? "", row?.menu_text ?? "");
  const { resolveRequestedVbsEvent } = await import("./vbs-event-context.js");
  const viewingEvent = await resolveRequestedVbsEvent(organizationId);
  const year = viewingEvent?.year ?? parseSeasonYear(viewingYear) ?? (await getActiveVbsYear(organizationId));
  const registrations = await loadAllergyRegistrations(organizationId, year, viewingEvent?.id);
  const allergy = buildAllergySummary(registrations.rows);
  const teams = await db().query<{ id: string; name: string }>(
    `SELECT id, name FROM org_teams WHERE organization_id = $1 ORDER BY name`,
    [organizationId],
  );
  const org = await db().query<{ name: string }>(`SELECT name FROM organizations WHERE id = $1`, [organizationId]);

  const allergyStudents = registrations.rows
    .filter((r) => formatAllergiesSummary(r.allergies_common ?? [], r.allergies_other) !== "None listed")
    .map((r) => ({
      childFullName: r.child_full_name,
      allergiesLabel: formatAllergiesSummary(r.allergies_common ?? [], r.allergies_other),
      classId: r.class_id ?? "",
    }));

  return {
    organizationName: org.rows[0]?.name ?? "",
    cookingTeamId,
    teams: teams.rows,
    canConfigureCooking: canConfigureCookingTeam(access.role, access.platformAdmin),
    extraInstructions: row?.extra_instructions ?? "",
    plan,
    planUpdatedAt: row?.updated_at?.toISOString() ?? "",
    studentCount: registrations.rows.length,
    allergySummary: allergy.summaryText,
    allergyByAllergen: [...allergy.byAllergen.entries()].map(([label, count]) => ({ label, count })),
    allergyStudents,
    commonAllergies: [...COMMON_REGISTRATION_ALLERGIES],
    defaultYear: defaultCurriculumYear(),
    publishers,
    programs: programs.map((program) => ({
      id: program.id,
      year: program.year,
      publisherId: program.publisherId,
      theme: program.theme,
    })),
  };
}

export async function saveCookingPlanSettings(
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
      `INSERT INTO vbs_registration_snacks_menu (organization_id, extra_instructions, menu_text, menu_json, updated_by, updated_at)
       VALUES ($1, $2, '', COALESCE((SELECT menu_json FROM vbs_registration_snacks_menu WHERE organization_id = $1), ''), $3, NOW())
       ON CONFLICT (organization_id) DO UPDATE SET extra_instructions = EXCLUDED.extra_instructions, updated_by = $3, updated_at = NOW()`,
      [organizationId, input.extraInstructions.slice(0, 4000), username],
    );
  }
  return getCookingPlanWorkspace(organizationId, username);
}

export async function saveCookingPlanLayout(
  organizationId: string,
  username: string,
  planInput: unknown,
) {
  const access = await accessContext(organizationId, username);
  if ("error" in access) {
    return access;
  }
  const plan = normalizeCookingPlan(planInput);
  await savePlan(organizationId, username, plan);
  return getCookingPlanWorkspace(organizationId, username);
}

function findItem(plan: CookingPlanDocument, itemId: string) {
  for (const day of SNACK_MENU_DAYS) {
    const item = plan.days[day.id].items.find((entry) => entry.id === itemId);
    if (item) {
      return { dayId: day.id, item };
    }
  }
  return null;
}

function titlesSimilar(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export async function generateCookingPlan(
  organizationId: string,
  username: string,
  input: {
    publisherId: string;
    year: number;
    title: string;
    replaceItemIds?: string[];
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
  const year = parseSeasonYear(input.year) ?? (await getActiveVbsYear(organizationId));
  const registrations = await loadAllergyRegistrations(organizationId, year);
  const menu = await loadPlanRow(organizationId);
  const extraInstructions = menu.rows[0]?.extra_instructions ?? "";
  let plan = planFromRow(menu.rows[0]?.menu_json ?? "", menu.rows[0]?.menu_text ?? "");
  const allergy = buildAllergySummary(registrations.rows);

  const promptBase = {
    publisher: publisherName(input.publisherId),
    year: input.year,
    title: input.title.trim(),
    organizationName: org.rows[0]?.name ?? "Church",
    allergySummary: allergy.summaryText,
    studentCount: registrations.rows.length,
    extraInstructions,
  };

  const replaceIds = [...new Set((input.replaceItemIds ?? []).filter((id) => typeof id === "string" && id.trim()))];
  const isItemRegen = replaceIds.length > 0 && allMenuItems(plan).length > 0;

  try {
    if (!isItemRegen) {
      const raw = await generateLlmText(buildCookingPlanGeneratePrompt(promptBase));
      const parsed = normalizeCookingPlan(extractJsonFromLlm(raw));
      plan = parsed;
    } else {
      const toReplace = replaceIds
        .map((id) => findItem(plan, id))
        .filter((entry): entry is { dayId: SnackMenuDayId; item: SnackMenuItem } => entry !== null);
      if (toReplace.length === 0) {
        return { error: "Selected items were not found in the plan" as const };
      }
      const replacePayload = toReplace.map(({ dayId, item }) => ({
        id: item.id,
        dayId,
        title: item.title,
        details: item.details,
        kind: item.kind,
        allergyLabel: item.allergyLabel,
      }));
      const keepPayload = allMenuItems(plan)
        .filter(({ item }) => !replaceIds.includes(item.id))
        .map(({ dayId, item }) => ({ dayId, title: item.title, kind: item.kind }));

      const raw = await generateLlmText(
        buildCookingPlanItemsPrompt({
          ...promptBase,
          strategy: plan.strategy,
          strategyNote: plan.strategyNote,
          replaceItemsJson: JSON.stringify(replacePayload, null, 2),
          keepItemsJson: JSON.stringify(keepPayload, null, 2),
        }),
      );
      const parsed = extractJsonFromLlm(raw) as { replacements?: unknown };
      const replacements = Array.isArray(parsed.replacements) ? parsed.replacements : [];
      for (const entry of replacements) {
        if (!entry || typeof entry !== "object") {
          continue;
        }
        const rec = entry as Record<string, unknown>;
        const id = typeof rec.id === "string" ? rec.id.trim() : "";
        const target = toReplace.find((t) => t.item.id === id);
        if (!target) {
          continue;
        }
        const title = typeof rec.title === "string" ? rec.title.trim() : "";
        if (!title) {
          continue;
        }
        let nextTitle = title.slice(0, 200);
        if (titlesSimilar(nextTitle, target.item.title)) {
          nextTitle = `${nextTitle} (option B)`;
        }
        const updated: SnackMenuItem = {
          id: target.item.id,
          title: nextTitle,
          details: typeof rec.details === "string" ? rec.details.slice(0, 2000) : target.item.details,
          kind: rec.kind === "allergy-alt" ? "allergy-alt" : "main",
          allergyLabel:
            typeof rec.allergyLabel === "string" ? rec.allergyLabel.slice(0, 200) : target.item.allergyLabel,
        };
        const dayId =
          typeof rec.dayId === "string" && SNACK_MENU_DAYS.some((d) => d.id === rec.dayId)
            ? (rec.dayId as SnackMenuDayId)
            : target.dayId;
        plan.days[target.dayId].items = plan.days[target.dayId].items.filter((i) => i.id !== id);
        plan.days[dayId].items.push(updated);
      }
    }
    await savePlan(organizationId, username, plan);
    return {
      plan,
      generatedAt: new Date().toISOString(),
      replacedItemCount: isItemRegen ? replaceIds.length : 0,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not generate cooking plan" };
  }
}
