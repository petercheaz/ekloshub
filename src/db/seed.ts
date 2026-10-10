import bcrypt from "bcryptjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedReviews } from "../curriculum.js";
import { seedMessages } from "../messages.js";
import { seedListings } from "../share.js";
import { seedSetupComments, seedSetupPosts } from "../setup.js";
import { seedUsers, seedVerifiedUsers } from "../users.js";
import { db } from "./pool.js";
import { ensureCornerstoneMembers } from "./seed-cornerstone-members.js";
import { ensureCornerstoneSamplePlan } from "./seed-cornerstone-plan.js";
import { putObject } from "./s3.js";

const photoDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "seed-photos");

export async function seedIfEmpty() {
  const existing = await db().query("SELECT COUNT(*)::int AS count FROM users");
  if ((existing.rows[0]?.count as number) > 0) {
    return;
  }

  const passwordHash = bcrypt.hashSync(process.env.AUTH_PASSWORD ?? "vbs-dev", 10);

  for (const username of seedUsers) {
    await db().query(
      "INSERT INTO users (username, password_hash, verified, platform_admin, vbs_default_all_filters) VALUES ($1, $2, $3, $4, TRUE)",
      [username, passwordHash, seedVerifiedUsers.has(username), username === "admin"],
    );
  }

  for (const review of seedReviews) {
    await db().query(
      `INSERT INTO reviews (
        id, program_id, username, created_at, what_people_say, biblical_teaching, biblical_teaching_notes,
        merch_help, merch_help_notes, fun, fun_notes, criticisms, cost
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (id) DO NOTHING`,
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
      ],
    );
  }

  for (const listing of seedListings) {
    await db().query(
      `INSERT INTO share_listings (
        id, year, publisher_id, title, item, details, available_on, contact, location, video_url, username, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (id) DO NOTHING`,
      [
        listing.id,
        listing.year,
        listing.publisherId,
        listing.title,
        listing.item ?? "",
        listing.details ?? "",
        listing.availableOn,
        listing.contact ?? "",
        listing.location ?? "",
        listing.videoUrl ?? "",
        listing.username,
        listing.createdAt,
      ],
    );
    for (const [index, file] of listing.attachments.entries()) {
      await db().query(
        `INSERT INTO share_attachments (id, listing_id, name, type, size, object_key, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO NOTHING`,
        [`${listing.id}-att-${index}`, listing.id, file.name, file.type, file.size, "", index],
      );
    }
  }

  await ensureSetupSeed(passwordHash);

  for (const message of seedMessages) {
    await db().query(
      `INSERT INTO messages (id, thread_id, from_user, to_users, body, created_at, read_by, deleted_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING`,
      [
        message.id,
        message.threadId,
        message.from,
        message.to,
        message.body,
        message.createdAt,
        message.readBy,
        message.deletedBy,
      ],
    );
  }
}

export async function ensureKnownAccounts() {
  const passwordHash = bcrypt.hashSync(process.env.AUTH_PASSWORD ?? "vbs-dev", 10);
  const username = "pcheaz@gmail.com";
  await db().query(
    `INSERT INTO users (username, password_hash, password_custom, verified, platform_admin, email, first_name, last_name, phone)
     VALUES ($1,$2,TRUE,TRUE,FALSE,$1,'Peter','Cheaz','4253547740')
     ON CONFLICT (username) DO UPDATE SET
       email = EXCLUDED.email,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       phone = EXCLUDED.phone,
       verified = TRUE,
       password_custom = TRUE`,
    [username, passwordHash],
  );

  const orgId = "org-cornerstone-seattle";
  const existing = await db().query<{ id: string }>(
    "SELECT id FROM organizations WHERE id = $1 OR LOWER(name) = LOWER($2)",
    [orgId, "Cornerstone Seattle"],
  );
  const id = existing.rows[0]?.id ?? orgId;
  if (!existing.rows[0]) {
    await db().query(
      `INSERT INTO organizations (id, name, address, contact, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [orgId, "Cornerstone Seattle", "Seattle, WA", "4253547740", username, new Date().toISOString()],
    );
  }
  await db().query(
    `INSERT INTO organization_members (organization_id, username, role)
     VALUES ($1,$2,'org_admin')
     ON CONFLICT (organization_id, username) DO UPDATE SET role = 'org_admin'`,
    [id, username],
  );

  await ensureCornerstoneMembers(id);

  await db().query(
    `UPDATE org_teams SET name = 'Building Team'
     WHERE organization_id = $1 AND LOWER(TRIM(name)) = 'building team 2027'`,
    [id],
  );
  await db().query(
    `UPDATE messages SET team_name = 'Building Team'
     WHERE tenant_id = $1 AND LOWER(TRIM(team_name)) = 'building team 2027'`,
    [id],
  );

  const { dedupeOrgTeamsByName } = await import("../teams.js");
  await dedupeOrgTeamsByName(id);
  await ensureCornerstoneSamplePlan(id, username);
  await ensureSetupSeed(passwordHash);
}

export async function ensureSetupSeed(passwordHash = bcrypt.hashSync(process.env.AUTH_PASSWORD ?? "vbs-dev", 10)) {
  for (const username of seedUsers) {
    await db().query(
      "INSERT INTO users (username, password_hash, verified, platform_admin, vbs_default_all_filters) VALUES ($1, $2, $3, $4, TRUE) ON CONFLICT (username) DO NOTHING",
      [username, passwordHash, seedVerifiedUsers.has(username), username === "admin"],
    );
  }

  for (const post of seedSetupPosts) {
    await db().query(
      `INSERT INTO setup_posts (id, year, publisher_id, title, body, video_url, username, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING`,
      [post.id, post.year, post.publisherId, post.title, post.body, post.videoUrl, post.username, post.createdAt],
    );
    let order = 0;
    for (const file of post.pictures) {
      const objectKey = await uploadSeedPhoto(file.name);
      await db().query(
        `INSERT INTO setup_media (id, post_id, kind, name, type, size, object_key, sort_order)
         VALUES ($1,$2,'picture',$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO NOTHING`,
        [`${post.id}-pic-${file.name}`, post.id, file.name, file.type, file.size, objectKey, order],
      );
      order += 1;
    }
    for (const file of post.attachments) {
      await db().query(
        `INSERT INTO setup_media (id, post_id, kind, name, type, size, object_key, sort_order)
         VALUES ($1,$2,'attachment',$3,$4,$5,'',$6)
         ON CONFLICT (id) DO NOTHING`,
        [`${post.id}-att-${file.name}`, post.id, file.name, file.type, file.size, order],
      );
      order += 1;
    }
  }

  for (const comment of seedSetupComments) {
    await db().query(
      `INSERT INTO setup_comments (id, post_id, username, body, created_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO NOTHING`,
      [comment.id, comment.postId, comment.username, comment.body, comment.createdAt],
    );
  }
}

async function uploadSeedPhoto(name: string) {
  const objectKey = `setups/${name}`;
  const bytes = await readFile(path.join(photoDir, name));
  await putObject(objectKey, bytes, "image/jpeg");
  return objectKey;
}
