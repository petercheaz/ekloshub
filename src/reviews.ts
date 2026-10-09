import {
  availableYears,
  defaultCurriculumYear,
  programs,
  publishers,
  type PublisherId,
  type Review,
} from "./curriculum.js";
import { isVerified } from "./users.js";
import { db } from "./db/pool.js";

type ReviewRow = {
  id: string;
  program_id: string;
  username: string;
  created_at: Date;
  what_people_say: string;
  biblical_teaching: number;
  biblical_teaching_notes: string;
  merch_help: number;
  merch_help_notes: string;
  fun: number;
  fun_notes: string;
  criticisms: string;
  cost: string;
  verified: boolean;
};

function presentReview(row: ReviewRow) {
  return {
    id: row.id,
    programId: row.program_id,
    username: row.username,
    createdAt: row.created_at.toISOString(),
    whatPeopleSay: row.what_people_say,
    biblicalTeaching: row.biblical_teaching,
    biblicalTeachingNotes: row.biblical_teaching_notes,
    merchHelp: row.merch_help,
    merchHelpNotes: row.merch_help_notes,
    fun: row.fun,
    funNotes: row.fun_notes,
    criticisms: row.criticisms,
    cost: row.cost,
    verified: row.verified,
  };
}

export async function listCurriculum(year: number, publisherIds: PublisherId[], tenantId: string | null) {
  const allowed = new Set(publisherIds);
  const matches = programs.filter((program) => program.year === year && allowed.has(program.publisherId));
  const reviews = await db().query<ReviewRow>(
    `SELECT r.*, u.verified
     FROM reviews r
     JOIN users u ON u.username = r.username
     WHERE ($1::text IS NULL AND r.tenant_id IS NULL OR r.tenant_id = $1)
     ORDER BY r.created_at DESC`,
    [tenantId],
  );
  const byProgram = new Map<string, ReturnType<typeof presentReview>[]>();
  for (const row of reviews.rows) {
    const list = byProgram.get(row.program_id) ?? [];
    list.push(presentReview(row));
    byProgram.set(row.program_id, list);
  }

  return {
    defaultYear: defaultCurriculumYear(),
    years: availableYears(),
    publishers,
    programs: matches.map((program) => ({
      ...program,
      publisherName: publishers.find((publisher) => publisher.id === program.publisherId)?.name,
      reviews: byProgram.get(program.id) ?? [],
    })),
  };
}

export async function addReview(
  username: string,
  tenantId: string | null,
  input: {
    programId: string;
    whatPeopleSay: string;
    biblicalTeaching: number;
    biblicalTeachingNotes: string;
    merchHelp: number;
    merchHelpNotes: string;
    fun: number;
    funNotes: string;
    criticisms: string;
    cost: string;
  },
) {
  const program = programs.find((item) => item.id === input.programId);
  if (!program) {
    return { error: "Curriculum not found" as const };
  }

  const review: Review = {
    id: crypto.randomUUID(),
    programId: input.programId,
    username,
    createdAt: new Date().toISOString(),
    whatPeopleSay: input.whatPeopleSay.trim(),
    biblicalTeaching: input.biblicalTeaching,
    biblicalTeachingNotes: input.biblicalTeachingNotes.trim(),
    merchHelp: input.merchHelp,
    merchHelpNotes: input.merchHelpNotes.trim(),
    fun: input.fun,
    funNotes: input.funNotes.trim(),
    criticisms: input.criticisms.trim(),
    cost: input.cost.trim(),
  };

  await db().query(
    `INSERT INTO reviews (
      id, program_id, username, created_at, what_people_say, biblical_teaching, biblical_teaching_notes,
      merch_help, merch_help_notes, fun, fun_notes, criticisms, cost, tenant_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      review.id,
      review.programId,
      review.username,
      review.createdAt,
      review.whatPeopleSay,
      review.biblicalTeaching,
      review.biblicalTeachingNotes,
      review.merchHelp,
      review.merchHelpNotes,
      review.fun,
      review.funNotes,
      review.criticisms,
      review.cost,
      tenantId,
    ],
  );

  return { review: { ...review, verified: await isVerified(username) } };
}
