import { defaultCurriculumYear, programs, publishers, type PublisherId } from "./curriculum.js";
import { db } from "./db/pool.js";

export type UserVbsCurriculum = {
  year: number;
  publisherId: string;
  programTitle: string;
  publisherName: string;
  /** When true, list pages start with year / publisher / curriculum set to All. */
  allFilters?: boolean;
};

type UserVbsRow = {
  vbs_default_year: number | null;
  vbs_default_publisher_id: string | null;
  vbs_default_program_title: string | null;
  vbs_default_all_filters: boolean;
};

const publisherIds = new Set(publishers.map((p) => p.id));

export function browseAllUserDefault(): UserVbsCurriculum {
  return {
    allFilters: true,
    year: 0,
    publisherId: "all",
    programTitle: "all",
    publisherName: "All publishers",
  };
}

function present(row: UserVbsRow): UserVbsCurriculum {
  if (row.vbs_default_all_filters) {
    return browseAllUserDefault();
  }
  if (!row.vbs_default_year || !row.vbs_default_publisher_id || !row.vbs_default_program_title) {
    return browseAllUserDefault();
  }
  const publisherName =
    publishers.find((p) => p.id === row.vbs_default_publisher_id)?.name ?? row.vbs_default_publisher_id;
  return {
    year: row.vbs_default_year,
    publisherId: row.vbs_default_publisher_id,
    programTitle: row.vbs_default_program_title,
    publisherName,
  };
}

export function userVbsCatalog() {
  return {
    defaultYear: defaultCurriculumYear,
    publishers: publishers.map((p) => ({ id: p.id, name: p.name })),
    programs: programs.map((p) => ({
      id: p.id,
      year: p.year,
      publisherId: p.publisherId,
      theme: p.theme,
    })),
  };
}

export async function getUserVbsDefault(username: string) {
  const result = await db().query<UserVbsRow>(
    `SELECT vbs_default_year, vbs_default_publisher_id, vbs_default_program_title, vbs_default_all_filters
     FROM users WHERE username = $1`,
    [username],
  );
  const row = result.rows[0];
  return {
    userDefault: row ? present(row) : browseAllUserDefault(),
    ...userVbsCatalog(),
  };
}

/** One-time: set browse-all as the saved default for every account. */
export async function migrateAllUsersToBrowseAllVbsDefault() {
  const applied = await db().query(`SELECT 1 FROM schema_data_migrations WHERE id = $1`, [
    "user_browse_all_vbs_default",
  ]);
  if ((applied.rowCount ?? 0) > 0) {
    return;
  }
  await db().query(
    `UPDATE users
     SET vbs_default_all_filters = TRUE,
         vbs_default_year = NULL,
         vbs_default_publisher_id = NULL,
         vbs_default_program_title = NULL`,
  );
  await db().query(`INSERT INTO schema_data_migrations (id) VALUES ($1)`, ["user_browse_all_vbs_default"]);
}

export async function setUserVbsDefault(
  username: string,
  input: { year: number; publisherId: string; programTitle: string; allFilters?: boolean },
) {
  if (input.allFilters) {
    await db().query(
      `UPDATE users
       SET vbs_default_all_filters = TRUE,
           vbs_default_year = NULL,
           vbs_default_publisher_id = NULL,
           vbs_default_program_title = NULL
       WHERE username = $1`,
      [username],
    );
    return {
      userDefault: {
        allFilters: true,
        year: 0,
        publisherId: "all",
        programTitle: "all",
        publisherName: "All publishers",
      } satisfies UserVbsCurriculum,
    };
  }

  const year = input.year;
  const publisherId = input.publisherId.trim();
  const programTitle = input.programTitle.trim();
  if (!Number.isInteger(year) || year < 2000) {
    return { error: "Year is required" as const };
  }
  if (!publisherIds.has(publisherId as PublisherId)) {
    return { error: "Publisher is required" as const };
  }
  if (!programTitle) {
    return { error: "VBS title is required" as const };
  }
  const validProgram = programs.some(
    (p) => p.year === year && p.publisherId === publisherId && p.theme === programTitle,
  );
  if (!validProgram) {
    return { error: "That publisher, year, and title do not match a known VBS program" as const };
  }

  await db().query(
    `UPDATE users
     SET vbs_default_all_filters = FALSE,
         vbs_default_year = $2,
         vbs_default_publisher_id = $3,
         vbs_default_program_title = $4
     WHERE username = $1`,
    [username, year, publisherId, programTitle],
  );

  const publisherName = publishers.find((p) => p.id === publisherId)?.name ?? publisherId;
  return {
    userDefault: {
      year,
      publisherId,
      programTitle,
      publisherName,
    },
  };
}

export async function clearUserVbsDefault(username: string) {
  await db().query(
    `UPDATE users
     SET vbs_default_all_filters = FALSE,
         vbs_default_year = NULL,
         vbs_default_publisher_id = NULL,
         vbs_default_program_title = NULL
     WHERE username = $1`,
    [username],
  );
  return { userDefault: browseAllUserDefault() };
}
