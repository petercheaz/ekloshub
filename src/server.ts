import "./db/config.js";
import express from "express";
import session from "express-session";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { login, logout, me, requireAuth } from "./auth.js";
import { defaultCurriculumYear, publishers, type PublisherId } from "./curriculum.js";
import { deleteThread, getThread, listThreads, markThread, sendMessage, unreadCount } from "./messages.js";
import { addReview, listCurriculum } from "./reviews.js";
import { addShare, listShares } from "./share-store.js";
import {
  addSetup,
  addSetupComment,
  deleteSetup,
  deleteSetupComment,
  listSetups,
} from "./setup-store.js";
import { applySchema } from "./db/schema.js";
import { waitForDb } from "./db/pool.js";
import { getObject, waitForS3 } from "./db/s3.js";
import { ensureKnownAccounts, seedIfEmpty } from "./db/seed.js";
import { isPlatformAdmin, isVerified, searchUsers } from "./users.js";
import {
  addOrganizationMember,
  createOrganization,
  deleteOrganization,
  getOrganization,
  listOrganizations,
  removeOrganizationMember,
} from "./orgs.js";
import { acceptInvite, createInvites, getInvite } from "./invites.js";
import { createTeam, listTeams, updateTeam } from "./teams.js";
import {
  generateRoomIdeaImages,
  listRoomIdeas,
  roomIdeaOptions,
  saveRoomIdea,
  shareRoomIdea,
} from "./room-ideas.js";
import {
  listNotifications,
  markNotificationRead,
  unreadNotificationCount,
} from "./notifications.js";
import { attachTenant, requireWrite } from "./tenant.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, "..", "dist", "client");
const port = Number(process.env.PORT) || 3000;
const publisherIds = new Set(publishers.map((publisher) => publisher.id));

const app = express();

app.use(express.json({ limit: "25mb" }));
app.use(
  session({
    name: "vbs.sid",
    secret: process.env.SESSION_SECRET ?? "dev-only-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.post("/api/login", login);
app.post("/api/logout", logout);
app.get("/api/me", me);

app.get("/api/orgs", requireAuth, async (req, res) => {
  const username = req.session.user!.username;
  res.json({
    organizations: await listOrganizations(username, await isPlatformAdmin(username)),
  });
});

app.post("/api/orgs", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const result = await createOrganization(req.session.user!.username, {
    name: text(body.name),
    address: text(body.address),
    contact: text(body.contact),
  });
  if ("error" in result) {
    res.status(400).json(result);
    return;
  }
  res.status(201).json(result.organization);
});

app.get("/api/orgs/:id", requireAuth, async (req, res) => {
  const username = req.session.user!.username;
  const result = await getOrganization(String(req.params.id), username, await isPlatformAdmin(username));
  if ("error" in result) {
    res.status(result.error === "Organization not found" ? 404 : 403).json(result);
    return;
  }
  res.json(result);
});

app.delete("/api/orgs/:id", requireAuth, async (req, res) => {
  const result = await deleteOrganization(String(req.params.id), req.session.user!.username);
  if ("error" in result) {
    res.status(result.error === "Organization not found" ? 404 : 403).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/members", requireAuth, async (req, res) => {
  const body = req.body as { username?: unknown; role?: unknown };
  const result = await addOrganizationMember(
    String(req.params.id),
    req.session.user!.username,
    typeof body.username === "string" ? body.username : "",
    typeof body.role === "string" ? body.role : "",
  );
  if ("error" in result) {
    const message = result.error ?? "Could not add member";
    res.status(message.includes("admin") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.get("/api/orgs/:id/teams", requireAuth, async (req, res) => {
  const username = req.session.user!.username;
  const org = await getOrganization(String(req.params.id), username, await isPlatformAdmin(username));
  if ("error" in org) {
    res.status(org.error === "Organization not found" ? 404 : 403).json(org);
    return;
  }
  res.json({ teams: org.teams });
});

app.post("/api/orgs/:id/teams", requireAuth, async (req, res) => {
  const body = req.body as { name?: unknown; members?: unknown };
  const result = await createTeam(String(req.params.id), req.session.user!.username, {
    name: typeof body.name === "string" ? body.name : "",
    members: typeof body.members === "string" ? body.members : "",
  });
  if ("error" in result) {
    const message = result.error ?? "Could not create team";
    res.status(message.includes("required") || message.includes("not a") ? 400 : 403).json(result);
    return;
  }
  res.status(201).json(result.team);
});

app.patch("/api/orgs/:id/teams/:teamId", requireAuth, async (req, res) => {
  const body = req.body as { name?: unknown; members?: unknown };
  const result = await updateTeam(String(req.params.id), String(req.params.teamId), req.session.user!.username, {
    name: typeof body.name === "string" ? body.name : "",
    members: typeof body.members === "string" ? body.members : "",
  });
  if ("error" in result) {
    const message = result.error ?? "Could not update team";
    res.status(message === "Team not found" ? 404 : message.includes("required") || message.includes("not a") ? 400 : 403).json(result);
    return;
  }
  res.json(result.team);
});

app.get("/api/orgs/:id/room-ideas", requireAuth, async (req, res) => {
  const result = await listRoomIdeas(String(req.params.id), req.session.user!.username);
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json({ ...result, ...(await roomIdeaOptions()) });
});

app.post("/api/orgs/:id/room-ideas/generate", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const result = await generateRoomIdeaImages(String(req.params.id), req.session.user!.username, {
    publisherId: typeof body.publisherId === "string" ? body.publisherId : "",
    year: Number(body.year),
    title: typeof body.title === "string" ? body.title : "",
    notes: typeof body.notes === "string" ? body.notes : "",
    sourceImage: typeof body.sourceImage === "string" ? body.sourceImage : "",
    count: typeof body.count === "number" ? body.count : undefined,
  });
  if (!("images" in result)) {
    res.status(result.error.includes("member") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/room-ideas", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const imageKeys = Array.isArray(body.imageKeys) ? body.imageKeys.filter((key): key is string => typeof key === "string") : [];
  const result = await saveRoomIdea(String(req.params.id), req.session.user!.username, {
    publisherId: typeof body.publisherId === "string" ? body.publisherId : "",
    year: Number(body.year),
    title: typeof body.title === "string" ? body.title : "",
    notes: typeof body.notes === "string" ? body.notes : "",
    sourceImage: typeof body.sourceImage === "string" ? body.sourceImage : "",
    imageKeys,
  });
  if (!("idea" in result)) {
    res.status(result.error.includes("member") ? 403 : 400).json(result);
    return;
  }
  res.status(201).json(result.idea);
});

app.post("/api/orgs/:id/room-ideas/:ideaId/share", requireAuth, async (req, res) => {
  const body = req.body as { teamIds?: unknown; usernames?: unknown; publicSetup?: unknown };
  const result = await shareRoomIdea(String(req.params.id), String(req.params.ideaId), req.session.user!.username, {
    teamIds: Array.isArray(body.teamIds) ? body.teamIds.filter((id): id is string => typeof id === "string") : [],
    usernames: typeof body.usernames === "string" ? body.usernames : "",
    publicSetup: body.publicSetup === true,
  });
  if (!("ok" in result)) {
    const message = result.error ?? "Could not share";
    const status = message.includes("member") || message.includes("Only") ? 403 : message.includes("not found") ? 404 : 400;
    res.status(status).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/invites", requireAuth, async (req, res) => {
  const body = req.body as { emails?: unknown };
  const result = await createInvites(
    String(req.params.id),
    req.session.user!.username,
    typeof body.emails === "string" ? body.emails : "",
  );
  if ("error" in result) {
    const status =
      result.error === "Organization not found" ? 404 : result.error === "Only org admins can send invites" ? 403 : 400;
    res.status(status).json(result);
    return;
  }
  res.status(201).json(result);
});

app.get("/api/invites/:token", async (req, res) => {
  const email = typeof req.query.email === "string" ? req.query.email : "";
  const result = await getInvite(String(req.params.token), email);
  if ("error" in result) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/invites/:token/accept", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const result = await acceptInvite(String(req.params.token), {
    email: text(body.email),
    secret: text(body.secret),
    firstName: text(body.firstName),
    lastName: text(body.lastName),
    phone: text(body.phone),
    password: text(body.password),
  });
  if ("error" in result) {
    const status = result.error === "Keyword does not match" ? 403 : 400;
    res.status(status).json(result);
    return;
  }
  req.session.user = { username: result.username };
  res.json({
    username: result.username,
    verified: await isVerified(result.username),
    platformAdmin: await isPlatformAdmin(result.username),
    organizationId: result.organizationId,
  });
});

app.get("/api/notifications", requireAuth, async (req, res) => {
  const username = req.session.user!.username;
  res.json({
    notifications: await listNotifications(username),
    unread: await unreadNotificationCount(username),
  });
});

app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
  await markNotificationRead(req.session.user!.username, String(req.params.id));
  res.json({ ok: true });
});

app.delete("/api/orgs/:id/members/:username", requireAuth, async (req, res) => {
  const result = await removeOrganizationMember(
    String(req.params.id),
    req.session.user!.username,
    String(req.params.username),
  );
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.get("/api/curriculum", requireAuth, attachTenant, async (req, res) => {
  const requestedYear = Number(req.query.year);
  const year = Number.isInteger(requestedYear) ? requestedYear : defaultCurriculumYear();

  const rawPublishers = typeof req.query.publishers === "string" ? req.query.publishers : "all";
  const selected =
    rawPublishers === "none"
      ? []
      : rawPublishers === "all" || rawPublishers.trim() === ""
        ? publishers.map((publisher) => publisher.id)
        : rawPublishers
            .split(",")
            .map((id) => id.trim())
            .filter((id): id is PublisherId => publisherIds.has(id as PublisherId));

  res.json(await listCurriculum(year, selected, req.tenantId));
});

app.post("/api/reviews", requireAuth, attachTenant, requireWrite, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const score = (value: unknown) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
  };

  const programId = typeof body.programId === "string" ? body.programId : "";
  const biblicalTeaching = score(body.biblicalTeaching);
  const merchHelp = score(body.merchHelp);
  const fun = score(body.fun);
  const text = (value: unknown) => (typeof value === "string" ? value : "");

  if (!programId || biblicalTeaching === null || merchHelp === null || fun === null) {
    res.status(400).json({ error: "Program and 1–5 scores are required" });
    return;
  }

  const result = await addReview(req.session.user!.username, req.tenantId, {
    programId,
    whatPeopleSay: text(body.whatPeopleSay),
    biblicalTeaching,
    biblicalTeachingNotes: text(body.biblicalTeachingNotes),
    merchHelp,
    merchHelpNotes: text(body.merchHelpNotes),
    fun,
    funNotes: text(body.funNotes),
    criticisms: text(body.criticisms),
    cost: text(body.cost),
  });

  if ("error" in result) {
    res.status(404).json(result);
    return;
  }

  res.status(201).json(result.review);
});

app.get("/api/shares", requireAuth, attachTenant, async (req, res) => {
  res.json(await listShares(req.tenantId));
});

app.post("/api/shares", requireAuth, attachTenant, requireWrite, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const year = Number(body.year);
  const publisherId = text(body.publisherId);
  const title = text(body.title);
  const item = text(body.item);
  const details = text(body.details);
  const availableOn = text(body.availableOn);
  const contact = text(body.contact);
  const location = text(body.location);
  const videoUrl = text(body.videoUrl);
  const attachments = Array.isArray(body.attachments)
    ? body.attachments
        .filter((file): file is Record<string, unknown> => typeof file === "object" && file !== null)
        .map((file) => ({
          name: text(file.name),
          type: text(file.type),
          size: Number(file.size) || 0,
          dataUrl: typeof file.dataUrl === "string" ? file.dataUrl : "",
        }))
        .filter((file) => file.name && file.size <= 1_000_000 && file.dataUrl.length <= 1_500_000)
        .slice(0, 4)
    : [];

  if (!Number.isInteger(year) || !publisherIds.has(publisherId as PublisherId) || !title || !availableOn) {
    res.status(400).json({ error: "Available date, publisher, and VBS name are required" });
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(availableOn)) {
    res.status(400).json({ error: "Available date must be mm/dd/yyyy" });
    return;
  }

  if (videoUrl && !/^https?:\/\//i.test(videoUrl)) {
    res.status(400).json({ error: "Video URL must start with http:// or https://" });
    return;
  }

  const listing = await addShare(req.session.user!.username, req.tenantId, {
    year,
    publisherId: publisherId as PublisherId,
    title,
    item,
    details,
    availableOn,
    contact,
    location,
    videoUrl,
    attachments,
  });
  res.status(201).json(listing);
});

function parseMedia(value: unknown, limit: number) {
  const text = (item: unknown) => (typeof item === "string" ? item.trim() : "");
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((file): file is Record<string, unknown> => typeof file === "object" && file !== null)
    .map((file) => ({
      name: text(file.name),
      type: text(file.type),
      size: Number(file.size) || 0,
      dataUrl: typeof file.dataUrl === "string" ? file.dataUrl : "",
    }))
    .filter((file) => file.name && file.size <= 1_000_000 && file.dataUrl.length <= 1_500_000)
    .slice(0, limit);
}

app.get("/api/setups", requireAuth, attachTenant, async (req, res) => {
  res.json(await listSetups(req.tenantId));
});

app.post("/api/setups", requireAuth, attachTenant, requireWrite, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const year = Number(body.year);
  const publisherId = text(body.publisherId);
  const title = text(body.title);
  const details = text(body.body);
  const videoUrl = text(body.videoUrl);
  const pictures = parseMedia(body.pictures, 6);
  const attachments = parseMedia(body.attachments, 4);

  if (!Number.isInteger(year) || !publisherIds.has(publisherId as PublisherId) || !title || !details) {
    res.status(400).json({ error: "Publisher, VBS name, and text are required" });
    return;
  }
  if (videoUrl && !/^https?:\/\//i.test(videoUrl)) {
    res.status(400).json({ error: "Video URL must start with http:// or https://" });
    return;
  }

  const post = await addSetup(req.session.user!.username, req.tenantId, {
    year,
    publisherId: publisherId as PublisherId,
    title,
    body: details,
    videoUrl,
    pictures,
    attachments,
  });
  res.status(201).json(post);
});

app.post("/api/setups/:id/comments", requireAuth, attachTenant, requireWrite, async (req, res) => {
  const payload = req.body as { body?: unknown };
  const result = await addSetupComment(
    req.session.user!.username,
    String(req.params.id),
    typeof payload.body === "string" ? payload.body : "",
    req.tenantId,
  );
  if ("error" in result) {
    res.status(result.error === "Setup not found" ? 404 : 400).json(result);
    return;
  }
  res.status(201).json(result);
});

app.delete("/api/setups/comments/:commentId", requireAuth, attachTenant, async (req, res) => {
  const result = await deleteSetupComment(req.session.user!.username, String(req.params.commentId));
  if ("error" in result) {
    res.status(result.error === "Comment not found" ? 404 : 403).json(result);
    return;
  }
  res.json(result);
});

app.delete("/api/setups/:id", requireAuth, attachTenant, async (req, res) => {
  const result = await deleteSetup(req.session.user!.username, String(req.params.id), req.tenantId);
  if ("error" in result) {
    res.status(result.error === "Setup not found" ? 404 : 403).json(result);
    return;
  }
  res.json(result);
});

app.get("/api/teams", requireAuth, attachTenant, async (req, res) => {
  if (!req.tenantId) {
    res.json({ teams: [] });
    return;
  }
  res.json({ teams: await listTeams(req.tenantId) });
});

app.get("/api/users", requireAuth, attachTenant, async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q : "";
  const scope = req.query.scope === "all" ? null : req.tenantId;
  res.json(await searchUsers(query, req.session.user!.username, scope));
});

app.get("/api/messages/unread-count", requireAuth, attachTenant, async (req, res) => {
  res.json({ count: await unreadCount(req.session.user!.username, req.tenantId) });
});

app.get("/api/messages", requireAuth, attachTenant, async (req, res) => {
  res.json(await listThreads(req.session.user!.username, req.tenantId));
});

app.get("/api/messages/:threadId", requireAuth, attachTenant, async (req, res) => {
  const thread = await getThread(req.session.user!.username, String(req.params.threadId), req.tenantId);
  if (!thread) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  res.json(thread);
});

app.post("/api/messages", requireAuth, attachTenant, requireWrite, async (req, res) => {
  const body = req.body as { to?: unknown; body?: unknown; teams?: unknown };
  const to = Array.isArray(body.to) ? body.to.filter((name): name is string => typeof name === "string") : [];
  const teams = Array.isArray(body.teams) ? body.teams.filter((id): id is string => typeof id === "string") : [];
  const text = typeof body.body === "string" ? body.body : "";
  const result = await sendMessage(req.session.user!.username, to, text, req.tenantId, undefined, teams);
  if ("error" in result) {
    res.status(400).json(result);
    return;
  }
  res.status(201).json(result.message);
});

app.post("/api/messages/:threadId/reply", requireAuth, attachTenant, requireWrite, async (req, res) => {
  const username = req.session.user!.username;
  const threadId = String(req.params.threadId);
  const thread = await getThread(username, threadId, req.tenantId);
  if (!thread) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  const payload = req.body as { body?: unknown; all?: unknown };
  const latest = thread[thread.length - 1];
  const recipients =
    payload.all === true
      ? [...new Set([latest.from, ...latest.to])].filter((name) => name !== username)
      : [latest.from === username ? latest.to[0] : latest.from].filter(Boolean);
  const text = typeof payload.body === "string" ? payload.body : "";
  const result = await sendMessage(username, recipients as string[], text, req.tenantId, threadId);
  if ("error" in result) {
    res.status(400).json(result);
    return;
  }
  res.status(201).json(result.message);
});

app.post("/api/messages/:threadId/read", requireAuth, attachTenant, async (req, res) => {
  const thread = await markThread(req.session.user!.username, String(req.params.threadId), true, req.tenantId);
  if (!thread) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  res.json(thread);
});

app.post("/api/messages/:threadId/unread", requireAuth, attachTenant, async (req, res) => {
  const thread = await markThread(req.session.user!.username, String(req.params.threadId), false, req.tenantId);
  if (!thread) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  res.json(thread);
});

app.delete("/api/messages/:threadId", requireAuth, attachTenant, async (req, res) => {
  await deleteThread(req.session.user!.username, String(req.params.threadId), req.tenantId);
  res.json({ ok: true });
});

app.use("/files", requireAuth, async (req, res) => {
  const key = decodeURIComponent(req.path.replace(/^\/+/, ""));
  if (!key || key.includes("..")) {
    res.status(400).json({ error: "Invalid file" });
    return;
  }
  try {
    const object = await getObject(key);
    if (object.ContentType) {
      res.setHeader("Content-Type", object.ContentType);
    }
    const bytes = object.Body ? Buffer.from(await object.Body.transformToByteArray()) : Buffer.alloc(0);
    res.send(bytes);
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

app.use(express.static(clientDist));

app.get("/{*path}", (_req, res, next) => {
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) {
      next();
    }
  });
});

async function start() {
  await waitForDb();
  await applySchema();
  await waitForS3();
  await seedIfEmpty();
  await ensureKnownAccounts();
  app.listen(port, () => {
    console.log(`VBS API listening on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
