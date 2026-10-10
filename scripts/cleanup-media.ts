import "../src/db/config.js";
import { waitForDb } from "../src/db/pool.js";
import { waitForS3 } from "../src/db/s3.js";
import { applySchema } from "../src/db/schema.js";
import { purgeOrphanCalendarReminders, purgeUnreferencedS3Objects } from "../src/db/cleanup.js";

async function main() {
  await waitForDb();
  await applySchema();
  await waitForS3();
  await purgeOrphanCalendarReminders();
  const summary = await purgeUnreferencedS3Objects();
  console.log(
    JSON.stringify(
      {
        deletedS3Objects: summary.deleted,
        removedStaleDbRows: summary.staleRows,
        referencedKeys: summary.referenced,
        storedKeys: summary.stored,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
