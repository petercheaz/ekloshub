import { db } from "./pool.js";

function eventIdForYear(organizationId: string, year: number) {
  return `evt-${organizationId}-${year}`;
}

async function yearsForOrg(organizationId: string) {
  const years = new Set<number>();
  const rows = await db().query<{ year: number | null }>(
    `SELECT active_vbs_year AS year FROM organizations WHERE id = $1
     UNION SELECT year FROM vbs_plans WHERE organization_id = $1
     UNION SELECT vbs_season_year FROM organization_members
       WHERE organization_id = $1 AND vbs_season_year IS NOT NULL
     UNION SELECT vbs_season_year FROM vbs_registrations
       WHERE organization_id = $1 AND vbs_season_year IS NOT NULL
     UNION SELECT vbs_season_year FROM vbs_registration_classes
       WHERE organization_id = $1 AND vbs_season_year IS NOT NULL
     UNION SELECT season_year FROM org_vbs_season_snapshots WHERE organization_id = $1`,
    [organizationId],
  );
  for (const row of rows.rows) {
    if (row.year && Number.isInteger(row.year) && row.year >= 2000) {
      years.add(row.year);
    }
  }
  if (years.size === 0) {
    years.add(new Date().getFullYear());
  }
  return [...years].sort((a, b) => b - a);
}

export async function migrateVbsEvents() {
  const orgs = await db().query<{ id: string; active_vbs_year: number | null }>(
    `SELECT id, active_vbs_year FROM organizations`,
  );
  for (const org of orgs.rows) {
    await migrateOrg(org.id, org.active_vbs_year);
  }
}

async function migrateOrg(organizationId: string, activeYear: number | null) {
  const years = await yearsForOrg(organizationId);
  const plan = await db().query<{
    year: number;
    publisher_id: string;
    program_title: string;
  }>(`SELECT year, publisher_id, program_title FROM vbs_plans WHERE organization_id = $1`, [organizationId]);
  const planByYear = new Map(plan.rows.map((row) => [row.year, row]));
  const snapshots = await db().query<{
    season_year: number;
    snapshot: { plan?: { publisherId?: string; programTitle?: string } };
  }>(`SELECT season_year, snapshot FROM org_vbs_season_snapshots WHERE organization_id = $1`, [organizationId]);
  const snapshotByYear = new Map(snapshots.rows.map((row) => [row.season_year, row.snapshot]));

  for (const year of years) {
    const id = eventIdForYear(organizationId, year);
    const live = planByYear.get(year);
    const snap = snapshotByYear.get(year);
    const publisherId = live?.publisher_id ?? snap?.plan?.publisherId ?? "";
    const programTitle = live?.program_title ?? snap?.plan?.programTitle ?? "";
    await db().query(
      `INSERT INTO vbs_events (id, organization_id, year, name, publisher_id, program_title, created_at, updated_at)
       VALUES ($1,$2,$3,'',$4,$5,NOW(),NOW())
       ON CONFLICT (id) DO UPDATE SET
         publisher_id = CASE WHEN vbs_events.publisher_id = '' THEN EXCLUDED.publisher_id ELSE vbs_events.publisher_id END,
         program_title = CASE WHEN vbs_events.program_title = '' THEN EXCLUDED.program_title ELSE vbs_events.program_title END`,
      [id, organizationId, year, publisherId, programTitle],
    );
  }

  for (const row of plan.rows) {
    const eventId = eventIdForYear(organizationId, row.year);
    await db().query(
      `UPDATE vbs_plans SET event_id = $2
       WHERE organization_id = $1 AND year = $3 AND event_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM vbs_plans other WHERE other.event_id = $2)`,
      [organizationId, eventId, row.year],
    );
  }

  for (const year of years) {
    const eventId = eventIdForYear(organizationId, year);
    await db().query(
      `UPDATE vbs_registrations SET vbs_event_id = $2
       WHERE organization_id = $1 AND vbs_season_year = $3 AND vbs_event_id IS NULL`,
      [organizationId, eventId, year],
    );
    await db().query(
      `UPDATE vbs_registration_classes SET vbs_event_id = $2
       WHERE organization_id = $1 AND COALESCE(vbs_season_year, $3) = $3 AND vbs_event_id IS NULL`,
      [organizationId, eventId, year],
    );
    await db().query(
      `UPDATE organization_members SET default_vbs_event_id = $2
       WHERE organization_id = $1 AND vbs_season_year = $3 AND default_vbs_event_id IS NULL`,
      [organizationId, eventId, year],
    );
    await db().query(
      `INSERT INTO vbs_event_members (event_id, username, organization_id)
       SELECT $2, username, organization_id FROM organization_members
       WHERE organization_id = $1 AND removed_at IS NULL AND vbs_season_year = $3
       ON CONFLICT DO NOTHING`,
      [organizationId, eventId, year],
    );
    await db().query(
      `INSERT INTO vbs_event_members (event_id, username, organization_id)
       SELECT $2, username, organization_id FROM organization_members
       WHERE organization_id = $1 AND removed_at IS NULL AND role = 'org_admin'
       ON CONFLICT DO NOTHING`,
      [organizationId, eventId],
    );
  }

  const currentYear = activeYear ?? plan.rows[0]?.year ?? years[0]!;
  const currentEventId = eventIdForYear(organizationId, currentYear);
  await db().query(
    `UPDATE organizations SET active_vbs_event_id = COALESCE(active_vbs_event_id, $2),
       active_vbs_year = COALESCE(active_vbs_year, $3)
     WHERE id = $1`,
    [organizationId, currentEventId, currentYear],
  );

  await materializeSnapshotPlans(organizationId, years, planByYear);
}

async function materializeSnapshotPlans(
  organizationId: string,
  years: number[],
  planByYear: Map<number, { year: number }>,
) {
  const { loadStoredSeasonSnapshot, restoreSeasonSnapshotToEventPlan } = await import(
    "../vbs-season-copy.js"
  );
  for (const year of years) {
    if (planByYear.has(year)) {
      continue;
    }
    const eventId = eventIdForYear(organizationId, year);
    const existing = await db().query(`SELECT 1 FROM vbs_plans WHERE event_id = $1`, [eventId]);
    if ((existing.rowCount ?? 0) > 0) {
      continue;
    }
    const snapshot = await loadStoredSeasonSnapshot(organizationId, year);
    if (!snapshot) {
      continue;
    }
    await restoreSeasonSnapshotToEventPlan(organizationId, eventId, snapshot);
  }
}
