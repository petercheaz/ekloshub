import { defaultCurriculumYear, programs, publishers, type PublisherId } from "./curriculum.js";
import { db } from "./db/pool.js";
import { objectUrl, storeUpload } from "./db/s3.js";
import { publisherName, sortListings, type ShareAttachment, type ShareListing } from "./share.js";
import { isVerified } from "./users.js";

type ListingRow = {
  id: string;
  year: number;
  publisher_id: PublisherId;
  title: string;
  item: string;
  details: string;
  available_on: Date | string;
  contact: string;
  location: string;
  video_url: string;
  username: string;
  created_at: Date;
  verified: boolean;
};

type AttachmentRow = {
  listing_id: string;
  name: string;
  type: string;
  size: number;
  object_key: string;
  sort_order: number;
};

function dateOnly(value: Date | string) {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function present(row: ListingRow, attachments: ShareAttachment[]) {
  return {
    id: row.id,
    year: row.year,
    publisherId: row.publisher_id,
    title: row.title,
    item: row.item ?? "",
    details: row.details ?? "",
    availableOn: dateOnly(row.available_on),
    contact: row.contact ?? "",
    location: row.location ?? "",
    videoUrl: row.video_url ?? "",
    attachments,
    username: row.username,
    createdAt: row.created_at.toISOString(),
    publisherName: publisherName(row.publisher_id),
    verified: row.verified,
  };
}

export async function listShares(tenantId: string | null) {
  const listings = await db().query<ListingRow>(
    `SELECT l.*, u.verified
     FROM share_listings l
     JOIN users u ON u.username = l.username
     WHERE ($1::text IS NULL AND l.tenant_id IS NULL OR l.tenant_id = $1)`,
    [tenantId],
  );
  const attachments = await db().query<AttachmentRow>(
    "SELECT listing_id, name, type, size, object_key, sort_order FROM share_attachments ORDER BY sort_order",
  );
  const byListing = new Map<string, ShareAttachment[]>();
  for (const row of attachments.rows) {
    const list = byListing.get(row.listing_id) ?? [];
    list.push({ name: row.name, type: row.type, size: row.size, dataUrl: objectUrl(row.object_key) });
    byListing.set(row.listing_id, list);
  }
  return {
    defaultYear: defaultCurriculumYear(),
    publishers,
    programs: programs.map((program) => ({
      id: program.id,
      year: program.year,
      publisherId: program.publisherId,
      theme: program.theme,
    })),
    listings: sortListings(listings.rows.map((row) => present(row, byListing.get(row.id) ?? []))),
  };
}

export async function addShare(
  username: string,
  tenantId: string | null,
  input: {
    year: number;
    publisherId: PublisherId;
    title: string;
    item: string;
    details: string;
    availableOn: string;
    contact: string;
    location: string;
    videoUrl: string;
    attachments: ShareAttachment[];
  },
) {
  const listing: ShareListing = {
    id: crypto.randomUUID(),
    year: input.year,
    publisherId: input.publisherId,
    title: input.title.trim(),
    item: input.item.trim(),
    details: input.details.trim(),
    availableOn: input.availableOn,
    contact: input.contact.trim(),
    location: input.location.trim(),
    videoUrl: input.videoUrl.trim(),
    attachments: [],
    username,
    createdAt: new Date().toISOString(),
  };

  await db().query(
    `INSERT INTO share_listings (
      id, year, publisher_id, title, item, details, available_on, contact, location, video_url, username, created_at, tenant_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      listing.id,
      listing.year,
      listing.publisherId,
      listing.title,
      listing.item,
      listing.details,
      listing.availableOn,
      listing.contact,
      listing.location,
      listing.videoUrl,
      listing.username,
      listing.createdAt,
      tenantId,
    ],
  );

  const stored: ShareAttachment[] = [];
  for (const [index, file] of input.attachments.entries()) {
    const uploaded = await storeUpload(`shares/${listing.id}`, file);
    await db().query(
      `INSERT INTO share_attachments (id, listing_id, name, type, size, object_key, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        crypto.randomUUID(),
        listing.id,
        uploaded.name,
        uploaded.type,
        uploaded.size,
        uploaded.objectKey,
        index,
      ],
    );
    stored.push({
      name: uploaded.name,
      type: uploaded.type,
      size: uploaded.size,
      dataUrl: objectUrl(uploaded.objectKey),
    });
  }

  return {
    ...listing,
    attachments: stored,
    publisherName: publisherName(listing.publisherId),
    verified: await isVerified(username),
  };
}
