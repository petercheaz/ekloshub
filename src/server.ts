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
import { isAcceptableAttachment } from "./media-limits.js";
import { waitForDb } from "./db/pool.js";
import { getObject, userCanAccessObjectKey, waitForS3 } from "./db/s3.js";
import { ensureKnownAccounts, seedIfEmpty } from "./db/seed.js";
import { isPlatformAdmin, isVerified, searchUsers } from "./users.js";
import {
  addOrganizationMember,
  createOrganization,
  deleteOrganization,
  getOrganization,
  listOrganizations,
  removeOrganizationMember,
  updateOrganizationMember,
} from "./orgs.js";
import { acceptInvite, createInvites, getInvite } from "./invites.js";
import {
  copyVbsSeasonFromYear,
  getSeasonCopyOptions,
  saveCurrentSeasonSnapshot,
} from "./vbs-season-copy.js";
import {
  listVolunteerCompliance,
  updateVolunteerBackgroundCheck,
} from "./vbs-volunteer-compliance.js";
import { createTeam, deleteTeam, listTeamsForViewer, updateTeam } from "./teams.js";
import {
  generateRoomIdeaImages,
  listRoomIdeas,
  roomIdeaOptions,
  saveRoomIdea,
  shareRoomIdea,
} from "./room-ideas.js";
import {
  browsePhotoshoppe,
  createPhotoshoppeFolder,
  loadPhotoshoppeDocument,
  savePhotoshoppeDocument,
} from "./photoshoppe-files.js";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
} from "./notifications.js";
import { attachTenant, requireWrite } from "./tenant.js";
import { clearUserVbsDefault, getUserVbsDefault, setUserVbsDefault } from "./user-vbs.js";
import {
  deleteVbsChecklistItem,
  addScheduleActivityLabel,
  deleteVbsScheduleSlot,
  deleteVbsStation,
  deleteVbsTask,
  generateVbsDailySchedule,
  getOrgVbsDefault,
  getVbsWorkspace,
  removeScheduleActivityLabel,
  setOrgVbsCurriculumDefault,
  saveVbsChecklistItem,
  saveVbsScheduleSlot,
  saveVbsStation,
  saveVbsTask,
  saveVbsWorksheet,
  updateVbsNotificationPrefs,
  upsertVbsPlan,
  deleteVbsSupplyItem,
  saveVbsSupplyItem,
} from "./vbs-plan.js";
import {
  deleteRegistrationStudent,
  generateRegistrationNametag,
  getRegistrationWorkspace,
  saveRegistrationStudent,
} from "./vbs-registration.js";
import {
  assignClassStaff,
  assignStudentClass,
  autoAssignStudentsByAge,
  deleteRegistrationClass,
  removeClassStaff,
  reorderClassStaff,
  reorderClassStudents,
  reorderRegistrationClasses,
  saveRegistrationClass,
} from "./vbs-registration-classes.js";
import { generateSnacksMenu, getCookingWorkspace, saveCookingSettings } from "./vbs-registration-cooking.js";
import {
  generateCookingPlan,
  getCookingPlanWorkspace,
  saveCookingPlanLayout,
  saveCookingPlanSettings,
} from "./vbs-cooking-plan.js";
import {
  closeReimbursementCycle,
  getReimbursementQueue,
  markTaskReimbursed,
} from "./vbs-reimbursements.js";
import {
  getPublicRegistrationForm,
  submitPublicRegistration,
  updatePublicRegistrationSettings,
  getPublicFamilyPage,
  updatePublicFamilySettings,
} from "./vbs-public-registration.js";
import { createBoardPost, createBoardReply } from "./vbs-board.js";
import { getUserContact, saveUserContact } from "./user-contact.js";
import { getNotificationProfile, updateOrgNotificationProfile } from "./user-profile.js";
import {
  processCalendarReminders,
  saveCalendarReminders,
  updateCalendarViewPref,
} from "./vbs-calendar.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, "..", "dist", "client");
const port = Number(process.env.PORT) || 3000;
const publisherIds = new Set(publishers.map((publisher) => publisher.id));
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET?.trim();
if (isProduction && !sessionSecret) {
  throw new Error("SESSION_SECRET is required when NODE_ENV=production");
}

const app = express();
if (isProduction) {
  app.set("trust proxy", 1);
}

app.use(express.json({ limit: "25mb" }));
app.use(
  session({
    name: "vbs.sid",
    secret: sessionSecret ?? "dev-only-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.post("/api/login", login);
app.post("/api/logout", logout);
app.get("/api/me", me);

app.get("/api/me/vbs-default", requireAuth, async (req, res) => {
  res.json(await getUserVbsDefault(req.session.user!.username));
});

app.put("/api/me/vbs-default", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : Number(value));
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const result = await setUserVbsDefault(req.session.user!.username, {
    year: num(body.year),
    publisherId: text(body.publisherId),
    programTitle: text(body.programTitle),
    allFilters: body.allFilters === true,
  });
  if ("error" in result) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.delete("/api/me/vbs-default", requireAuth, async (req, res) => {
  res.json(await clearUserVbsDefault(req.session.user!.username));
});

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

app.get("/api/orgs/:id/season-copy", requireAuth, async (req, res) => {
  const result = await getSeasonCopyOptions(String(req.params.id), req.session.user!.username);
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/season-copy", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const fromYear = Number(body.fromYear);
  const toYear = Number(body.toYear);
  const startDate = typeof body.startDate === "string" ? body.startDate : undefined;
  const endDate = typeof body.endDate === "string" ? body.endDate : undefined;
  const result = await copyVbsSeasonFromYear(String(req.params.id), req.session.user!.username, {
    fromYear,
    toYear,
    startDate,
    endDate,
  });
  if ("error" in result) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.get("/api/orgs/:id/volunteer-compliance", requireAuth, async (req, res) => {
  const result = await listVolunteerCompliance(String(req.params.id), req.session.user!.username);
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.patch("/api/orgs/:id/volunteer-compliance/:username", requireAuth, async (req, res) => {
  const body = req.body as { status?: unknown };
  const status = typeof body.status === "string" ? body.status : "";
  const result = await updateVolunteerBackgroundCheck(
    String(req.params.id),
    req.session.user!.username,
    String(req.params.username),
    status,
  );
  if ("error" in result) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/season-snapshot", requireAuth, async (req, res) => {
  const result = await saveCurrentSeasonSnapshot(String(req.params.id), req.session.user!.username);
  if ("error" in result) {
    res.status(400).json(result);
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

app.patch("/api/orgs/:id/members/:username", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const result = await updateOrganizationMember(
    String(req.params.id),
    req.session.user!.username,
    String(req.params.username),
    {
      role: text(body.role),
      firstName: text(body.firstName),
      lastName: text(body.lastName),
      phone: text(body.phone),
      email: text(body.email),
      verified: body.verified === true,
      newPassword: text(body.newPassword),
      resetPasswordToDefault: body.resetPasswordToDefault === true,
      teamAdminTeamIds: Array.isArray(body.teamAdminTeamIds)
        ? body.teamAdminTeamIds.filter((id): id is string => typeof id === "string")
        : [],
      vbsSeasonYear: typeof body.vbsSeasonYear === "number" ? body.vbsSeasonYear : undefined,
      restoreMember: body.restoreMember === true,
    },
  );
  if ("error" in result) {
    const message = result.error ?? "Could not update member";
    res.status(message.includes("admin") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.get("/api/orgs/:id/contact", requireAuth, async (req, res) => {
  const { getContactOptions } = await import("./org-contact.js");
  const result = await getContactOptions(String(req.params.id), req.session.user!.username);
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/contact", requireAuth, async (req, res) => {
  const body = req.body as {
    subject?: unknown;
    message?: unknown;
    scope?: unknown;
    teamIds?: unknown;
  };
  const { sendOrgContact } = await import("./org-contact.js");
  const result = await sendOrgContact(String(req.params.id), req.session.user!.username, {
    subject: typeof body.subject === "string" ? body.subject : "",
    message: typeof body.message === "string" ? body.message : "",
    scope: body.scope === "teams" ? "teams" : "organization",
    teamIds: Array.isArray(body.teamIds) ? body.teamIds.filter((id): id is string => typeof id === "string") : [],
  });
  if ("error" in result) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/contact/parents", requireAuth, async (req, res) => {
  const body = req.body as { subject?: unknown; message?: unknown; scope?: unknown; classId?: unknown };
  const { sendParentContact } = await import("./org-contact.js");
  const result = await sendParentContact(String(req.params.id), req.session.user!.username, {
    subject: typeof body.subject === "string" ? body.subject : "",
    message: typeof body.message === "string" ? body.message : "",
    scope: body.scope === "class" ? "class" : "all",
    classId: typeof body.classId === "string" ? body.classId : "",
  });
  if ("error" in result) {
    res.status(400).json(result);
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
  const body = req.body as { name?: unknown; members?: unknown; teamAdminUsername?: unknown };
  const result = await createTeam(String(req.params.id), req.session.user!.username, {
    name: typeof body.name === "string" ? body.name : "",
    members: typeof body.members === "string" ? body.members : "",
    teamAdminUsername: typeof body.teamAdminUsername === "string" ? body.teamAdminUsername : undefined,
  });
  if ("error" in result) {
    const message = result.error ?? "Could not create team";
    res.status(message.includes("required") || message.includes("not a") ? 400 : 403).json(result);
    return;
  }
  res.status(201).json(result.team);
});

app.patch("/api/orgs/:id/teams/:teamId", requireAuth, async (req, res) => {
  const body = req.body as { name?: unknown; members?: unknown; teamAdminUsername?: unknown };
  const result = await updateTeam(String(req.params.id), String(req.params.teamId), req.session.user!.username, {
    name: typeof body.name === "string" ? body.name : "",
    members: typeof body.members === "string" ? body.members : "",
    teamAdminUsername: typeof body.teamAdminUsername === "string" ? body.teamAdminUsername : "",
  });
  if ("error" in result) {
    const message = result.error ?? "Could not update team";
    res.status(message === "Team not found" ? 404 : message.includes("required") || message.includes("not a") ? 400 : 403).json(result);
    return;
  }
  res.json(result.team);
});

app.delete("/api/orgs/:id/teams/:teamId", requireAuth, async (req, res) => {
  const result = await deleteTeam(String(req.params.id), String(req.params.teamId), req.session.user!.username);
  if ("error" in result) {
    const message = result.error ?? "Could not delete team";
    res.status(message === "Team not found" ? 404 : 403).json(result);
    return;
  }
  res.json(result);
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

app.get("/api/orgs/:id/photoshoppe", requireAuth, async (req, res) => {
  const folderId = typeof req.query.folderId === "string" && req.query.folderId.trim() ? req.query.folderId.trim() : null;
  const result = await browsePhotoshoppe(String(req.params.id), req.session.user!.username, folderId);
  if ("error" in result) {
    res.status(result.error.includes("member") ? 403 : 404).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/photoshoppe/folders", requireAuth, async (req, res) => {
  const body = req.body as { parentId?: unknown; name?: unknown };
  const parentId =
    typeof body.parentId === "string" && body.parentId.trim() ? body.parentId.trim() : null;
  const result = await createPhotoshoppeFolder(String(req.params.id), req.session.user!.username, {
    parentId,
    name: typeof body.name === "string" ? body.name : "",
  });
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("member") ? 403 : 400).json({ error: message });
    return;
  }
  res.status(201).json(result);
});

app.post("/api/orgs/:id/photoshoppe/documents", requireAuth, async (req, res) => {
  const body = req.body as {
    parentId?: unknown;
    name?: unknown;
    documentId?: unknown;
    snapshot?: unknown;
    preview?: unknown;
  };
  const parentId =
    typeof body.parentId === "string" && body.parentId.trim() ? body.parentId.trim() : null;
  const preview = body.preview as { name?: string; type?: string; size?: number; dataUrl?: string };
  const result = await savePhotoshoppeDocument(String(req.params.id), req.session.user!.username, {
    parentId,
    name: typeof body.name === "string" ? body.name : "",
    documentId: typeof body.documentId === "string" ? body.documentId : undefined,
    snapshot: body.snapshot as import("./photoshoppe-files.js").EditorSnapshot,
    preview: {
      name: typeof preview?.name === "string" ? preview.name : "preview.png",
      type: typeof preview?.type === "string" ? preview.type : "image/png",
      size: typeof preview?.size === "number" ? preview.size : 0,
      dataUrl: typeof preview?.dataUrl === "string" ? preview.dataUrl : "",
    },
  });
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("member") ? 403 : 400).json({ error: message });
    return;
  }
  res.status(body.documentId ? 200 : 201).json(result);
});

app.get("/api/orgs/:id/photoshoppe/documents/:documentId", requireAuth, async (req, res) => {
  const result = await loadPhotoshoppeDocument(
    String(req.params.id),
    req.session.user!.username,
    String(req.params.documentId),
  );
  if ("error" in result) {
    res.status(result.error.includes("member") ? 403 : 404).json(result);
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

app.get("/api/orgs/:id/vbs-default", requireAuth, async (req, res) => {
  const result = await getOrgVbsDefault(String(req.params.id), req.session.user!.username);
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.put("/api/orgs/:id/vbs-default", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : Number(value));
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const result = await setOrgVbsCurriculumDefault(String(req.params.id), req.session.user!.username, {
    year: num(body.year),
    publisherId: text(body.publisherId),
    programTitle: text(body.programTitle),
  });
  if ("error" in result) {
    const message = result.error ?? "Could not save default";
    res.status(message.includes("write") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.get("/api/public/register/:token", async (req, res) => {
  const result = await getPublicRegistrationForm(String(req.params.token));
  if ("error" in result) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/public/register/:token", async (req, res) => {
  const result = await submitPublicRegistration(
    String(req.params.token),
    req.body as Record<string, unknown>,
    { ip: req.ip, forwarded: req.get("x-forwarded-for") ?? undefined },
  );
  if (!("ok" in result)) {
    res.status(400).json(result);
    return;
  }
  res.status(201).json(result);
});

app.patch("/api/orgs/:id/vbs-registration/public", requireAuth, async (req, res) => {
  const body = req.body as { enabled?: unknown; regenerateToken?: unknown };
  const result = await updatePublicRegistrationSettings(
    String(req.params.id),
    req.session.user!.username,
    {
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      regenerateToken: body.regenerateToken === true,
    },
  );
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("permission") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.get("/api/public/family/:token", async (req, res) => {
  const result = await getPublicFamilyPage(String(req.params.token));
  if ("error" in result) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});

app.patch("/api/orgs/:id/vbs-registration/family-page", requireAuth, async (req, res) => {
  const body = req.body as { enabled?: unknown; regenerateToken?: unknown };
  const result = await updatePublicFamilySettings(String(req.params.id), req.session.user!.username, {
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    regenerateToken: body.regenerateToken === true,
  });
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("permission") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.get("/api/orgs/:id/vbs-registration", requireAuth, async (req, res) => {
  const result = await getRegistrationWorkspace(String(req.params.id), req.session.user!.username);
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.get("/api/orgs/:id/vbs-registration/cooking", requireAuth, async (req, res) => {
  const result = await getCookingWorkspace(String(req.params.id), req.session.user!.username);
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("permission") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.patch("/api/orgs/:id/vbs-registration/cooking", requireAuth, async (req, res) => {
  const body = req.body as { cookingTeamId?: unknown; extraInstructions?: unknown };
  const result = await saveCookingSettings(String(req.params.id), req.session.user!.username, {
    cookingTeamId: typeof body.cookingTeamId === "string" ? body.cookingTeamId : undefined,
    extraInstructions: typeof body.extraInstructions === "string" ? body.extraInstructions : undefined,
  });
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("permission") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.get("/api/orgs/:id/cooking-plan", requireAuth, async (req, res) => {
  const result = await getCookingPlanWorkspace(String(req.params.id), req.session.user!.username);
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("permission") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.patch("/api/orgs/:id/cooking-plan", requireAuth, async (req, res) => {
  const body = req.body as { cookingTeamId?: unknown; extraInstructions?: unknown };
  const result = await saveCookingPlanSettings(String(req.params.id), req.session.user!.username, {
    cookingTeamId: typeof body.cookingTeamId === "string" ? body.cookingTeamId : undefined,
    extraInstructions: typeof body.extraInstructions === "string" ? body.extraInstructions : undefined,
  });
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("permission") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.put("/api/orgs/:id/cooking-plan/layout", requireAuth, async (req, res) => {
  const result = await saveCookingPlanLayout(
    String(req.params.id),
    req.session.user!.username,
    req.body,
  );
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("permission") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/cooking-plan/generate", requireAuth, async (req, res) => {
  const body = req.body as { publisherId?: unknown; year?: unknown; title?: unknown; replaceItemIds?: unknown };
  const replaceItemIds = Array.isArray(body.replaceItemIds)
    ? body.replaceItemIds.filter((id): id is string => typeof id === "string")
    : undefined;
  const result = await generateCookingPlan(String(req.params.id), req.session.user!.username, {
    publisherId: typeof body.publisherId === "string" ? body.publisherId : "",
    year: Number(body.year),
    title: typeof body.title === "string" ? body.title : "",
    replaceItemIds,
  });
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("permission") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/vbs-registration/cooking/generate-menu", requireAuth, async (req, res) => {
  const body = req.body as {
    publisherId?: unknown;
    year?: unknown;
    title?: unknown;
    regenerateDays?: unknown;
    dayHints?: unknown;
  };
  const dayHintsRaw = body.dayHints;
  const dayHints =
    dayHintsRaw && typeof dayHintsRaw === "object" && !Array.isArray(dayHintsRaw)
      ? (dayHintsRaw as Partial<Record<string, string>>)
      : undefined;
  const result = await generateSnacksMenu(String(req.params.id), req.session.user!.username, {
    publisherId: typeof body.publisherId === "string" ? body.publisherId : "",
    year: Number(body.year),
    title: typeof body.title === "string" ? body.title : "",
    regenerateDays: body.regenerateDays,
    dayHints,
  });
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("permission") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/vbs-registration/students", requireAuth, async (req, res) => {
  const result = await saveRegistrationStudent(
    String(req.params.id),
    req.session.user!.username,
    req.body as Record<string, unknown>,
  );
  if (!("student" in result)) {
    const message = "error" in result ? (result.error ?? "Error") : "Error";
    res.status(message.includes("permission") ? 403 : 400).json(result);
    return;
  }
  res.status(typeof (req.body as { id?: string }).id === "string" ? 200 : 201).json(result);
});

app.post("/api/orgs/:id/vbs-registration/classes", requireAuth, async (req, res) => {
  const result = await saveRegistrationClass(
    String(req.params.id),
    req.session.user!.username,
    req.body as Record<string, unknown>,
  );
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("permission") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.delete("/api/orgs/:id/vbs-registration/classes/:classId", requireAuth, async (req, res) => {
  const result = await deleteRegistrationClass(
    String(req.params.id),
    req.session.user!.username,
    String(req.params.classId),
  );
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("permission") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.patch("/api/orgs/:id/vbs-registration/classes/order", requireAuth, async (req, res) => {
  const body = req.body as { classIds?: unknown };
  const classIds = Array.isArray(body.classIds)
    ? body.classIds.filter((id): id is string => typeof id === "string")
    : [];
  const result = await reorderRegistrationClasses(
    String(req.params.id),
    req.session.user!.username,
    classIds,
  );
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("permission") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/vbs-registration/classes/auto-assign-students-by-age", requireAuth, async (req, res) => {
  const result = await autoAssignStudentsByAge(String(req.params.id), req.session.user!.username);
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("permission") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.patch("/api/orgs/:id/vbs-registration/classes/:classId/students/order", requireAuth, async (req, res) => {
  const body = req.body as { studentIds?: unknown };
  const studentIds = Array.isArray(body.studentIds)
    ? body.studentIds.filter((id): id is string => typeof id === "string")
    : [];
  const result = await reorderClassStudents(
    String(req.params.id),
    req.session.user!.username,
    String(req.params.classId),
    studentIds,
  );
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("permission") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.patch("/api/orgs/:id/vbs-registration/students/unassigned/order", requireAuth, async (req, res) => {
  const body = req.body as { studentIds?: unknown };
  const studentIds = Array.isArray(body.studentIds)
    ? body.studentIds.filter((id): id is string => typeof id === "string")
    : [];
  const result = await reorderClassStudents(
    String(req.params.id),
    req.session.user!.username,
    null,
    studentIds,
  );
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("permission") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.patch("/api/orgs/:id/vbs-registration/classes/:classId/staff/order", requireAuth, async (req, res) => {
  const body = req.body as { role?: unknown; usernames?: unknown };
  const roleRaw = typeof body.role === "string" ? body.role : "teacher";
  const role = roleRaw === "leader" ? "leader" : roleRaw === "helper" ? "helper" : "teacher";
  const usernames = Array.isArray(body.usernames)
    ? body.usernames.filter((u): u is string => typeof u === "string")
    : [];
  const result = await reorderClassStaff(
    String(req.params.id),
    req.session.user!.username,
    String(req.params.classId),
    role,
    usernames,
  );
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("permission") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.patch("/api/orgs/:id/vbs-registration/students/:studentId/class", requireAuth, async (req, res) => {
  const body = req.body as { classId?: unknown };
  const classId =
    body.classId === null || body.classId === ""
      ? null
      : typeof body.classId === "string"
        ? body.classId.trim()
        : null;
  const result = await assignStudentClass(
    String(req.params.id),
    req.session.user!.username,
    String(req.params.studentId),
    classId,
  );
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("permission") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.put("/api/orgs/:id/vbs-registration/classes/:classId/staff", requireAuth, async (req, res) => {
  const body = req.body as { username?: unknown; role?: unknown };
  const roleRaw = typeof body.role === "string" ? body.role : "teacher";
  const role = roleRaw === "leader" ? "leader" : roleRaw === "helper" ? "helper" : "teacher";
  const username = typeof body.username === "string" ? body.username : "";
  const result = await assignClassStaff(
    String(req.params.id),
    req.session.user!.username,
    String(req.params.classId),
    username,
    role,
  );
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("permission") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.delete(
  "/api/orgs/:id/vbs-registration/classes/:classId/students/:studentId",
  requireAuth,
  async (req, res) => {
    const { removeStudentFromClass } = await import("./vbs-registration-classes.js");
    const result = await removeStudentFromClass(
      String(req.params.id),
      req.session.user!.username,
      String(req.params.studentId),
      String(req.params.classId),
    );
    if ("error" in result) {
      const message = result.error ?? "Error";
      res.status(message.includes("permission") ? 403 : 400).json(result);
      return;
    }
    res.json(result);
  },
);

app.delete(
  "/api/orgs/:id/vbs-registration/classes/:classId/staff/:username",
  requireAuth,
  async (req, res) => {
    const result = await removeClassStaff(
      String(req.params.id),
      req.session.user!.username,
      String(req.params.classId),
      String(req.params.username),
    );
    if ("error" in result) {
      const message = result.error ?? "Error";
      res.status(message.includes("permission") ? 403 : 400).json(result);
      return;
    }
    res.json(result);
  },
);

app.delete("/api/orgs/:id/vbs-registration/students/:studentId", requireAuth, async (req, res) => {
  const result = await deleteRegistrationStudent(
    String(req.params.id),
    req.session.user!.username,
    String(req.params.studentId),
  );
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("permission") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/vbs-registration/students/:studentId/nametag", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const result = await generateRegistrationNametag(
    String(req.params.id),
    req.session.user!.username,
    String(req.params.studentId),
    {
      publisherId: typeof body.publisherId === "string" ? body.publisherId : "",
      year: Number(body.year),
      title: typeof body.title === "string" ? body.title : "",
      extraInstructions: typeof body.extraInstructions === "string" ? body.extraInstructions : "",
      assignedTeamId: typeof body.assignedTeamId === "string" ? body.assignedTeamId : "",
    },
  );
  if (!("student" in result)) {
    const message = "error" in result ? (result.error ?? "Error") : "Error";
    res.status(message.includes("permission") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.get("/api/orgs/:id/vbs-plan", requireAuth, async (req, res) => {
  const result = await getVbsWorkspace(String(req.params.id), req.session.user!.username);
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.get("/api/orgs/:id/vbs-plan/reimbursements", requireAuth, async (req, res) => {
  const result = await getReimbursementQueue(String(req.params.id), req.session.user!.username);
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("org admin") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/vbs-plan/reimbursements/:taskId/reimbursed", requireAuth, async (req, res) => {
  const result = await markTaskReimbursed(
    String(req.params.id),
    req.session.user!.username,
    String(req.params.taskId),
  );
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("org admin") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/vbs-plan/reimbursements/close-cycle", requireAuth, async (req, res) => {
  const result = await closeReimbursementCycle(String(req.params.id), req.session.user!.username);
  if ("error" in result) {
    const message = result.error ?? "Error";
    res.status(message.includes("org admin") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.put("/api/orgs/:id/vbs-plan", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : Number(value));
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const result = await upsertVbsPlan(String(req.params.id), req.session.user!.username, {
    year: num(body.year),
    title: text(body.title),
    publisherId: text(body.publisherId),
    programTitle: text(body.programTitle),
    location: text(body.location),
    startDate: text(body.startDate),
    endDate: text(body.endDate),
    dailyStart: text(body.dailyStart),
    dailyEnd: text(body.dailyEnd),
    expectedKids: num(body.expectedKids),
    coordinatorNotes: text(body.coordinatorNotes),
    familyPublicNotes: text(body.familyPublicNotes),
    budgetAmount: num(body.budgetAmount),
    expensesAmount: num(body.expensesAmount),
    seedTemplate: body.seedTemplate !== false,
    seedSchedule: body.seedSchedule === true,
  });
  if ("error" in result) {
    const message = result.error ?? "Could not save plan";
    res.status(message.includes("write") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.patch("/api/orgs/:id/vbs-plan/worksheet", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const worksheetData =
    body.worksheetData && typeof body.worksheetData === "object" ? (body.worksheetData as Record<string, unknown>) : {};
  const result = await saveVbsWorksheet(String(req.params.id), req.session.user!.username, worksheetData);
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/vbs-plan/tasks", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : Number(value));
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const result = await saveVbsTask(String(req.params.id), req.session.user!.username, {
    id: text(body.id) || undefined,
    title: text(body.title),
    description: text(body.description),
    notes: text(body.notes),
    category: text(body.category),
    status: text(body.status),
    dueDate: text(body.dueDate),
    assignedUsername: text(body.assignedUsername),
    assignedTeamId: text(body.assignedTeamId),
    expenseAmount: num(body.expenseAmount),
    reimbursementStatus: text(body.reimbursementStatus),
    attachments: parseMedia(body.attachments, 10),
    notify: body.notify === true,
  });
  if ("error" in result) {
    const message = result.error ?? "Could not save task";
    res.status(message.includes("cannot") || message.includes("write") ? 403 : 400).json(result);
    return;
  }
  res.json(result);
});

app.delete("/api/orgs/:id/vbs-plan/tasks/:taskId", requireAuth, async (req, res) => {
  const result = await deleteVbsTask(String(req.params.id), req.session.user!.username, String(req.params.taskId));
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/vbs-plan/stations", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const result = await saveVbsStation(String(req.params.id), req.session.user!.username, {
    id: text(body.id) || undefined,
    name: text(body.name),
    description: text(body.description),
    defaultTeamId: text(body.defaultTeamId),
  });
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.delete("/api/orgs/:id/vbs-plan/stations/:stationId", requireAuth, async (req, res) => {
  const result = await deleteVbsStation(
    String(req.params.id),
    req.session.user!.username,
    String(req.params.stationId),
  );
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/vbs-plan/schedule", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const result = await saveVbsScheduleSlot(String(req.params.id), req.session.user!.username, {
    id: text(body.id) || undefined,
    dayDate: text(body.dayDate),
    startsAt: text(body.startsAt),
    endsAt: text(body.endsAt),
    label: text(body.label),
    stationId: text(body.stationId),
    teamId: text(body.teamId),
    notes: text(body.notes),
    roleLabel: text(body.roleLabel),
    assignedUsername: text(body.assignedUsername),
  });
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/vbs-plan/supplies", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : Number(value));
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const result = await saveVbsSupplyItem(String(req.params.id), req.session.user!.username, {
    id: text(body.id) || undefined,
    name: text(body.name),
    quantity: text(body.quantity),
    estimatedCost: num(body.estimatedCost),
    purchased: body.purchased === true,
    assignedTeamId: text(body.assignedTeamId),
    notes: text(body.notes),
  });
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.delete("/api/orgs/:id/vbs-plan/supplies/:itemId", requireAuth, async (req, res) => {
  const result = await deleteVbsSupplyItem(
    String(req.params.id),
    req.session.user!.username,
    String(req.params.itemId),
  );
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.delete("/api/orgs/:id/vbs-plan/schedule/:slotId", requireAuth, async (req, res) => {
  const result = await deleteVbsScheduleSlot(
    String(req.params.id),
    req.session.user!.username,
    String(req.params.slotId),
  );
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/vbs-plan/schedule/generate", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const replace = body.replace === true;
  const result = await generateVbsDailySchedule(String(req.params.id), req.session.user!.username, replace);
  if ("error" in result) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/vbs-plan/schedule-activities", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const label = typeof body.label === "string" ? body.label : "";
  const result = await addScheduleActivityLabel(String(req.params.id), req.session.user!.username, label);
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.delete("/api/orgs/:id/vbs-plan/schedule-activities/:label", requireAuth, async (req, res) => {
  const result = await removeScheduleActivityLabel(
    String(req.params.id),
    req.session.user!.username,
    String(req.params.label),
  );
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/vbs-plan/checklist", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const statusRaw = text(body.status);
  const result = await saveVbsChecklistItem(String(req.params.id), req.session.user!.username, {
    id: text(body.id) || undefined,
    category: text(body.category),
    label: text(body.label),
    done: typeof body.done === "boolean" ? body.done : undefined,
    status:
      statusRaw === "not_started" || statusRaw === "in_progress" || statusRaw === "done"
        ? statusRaw
        : undefined,
    assignedTeamId: text(body.assignedTeamId),
    dueDate: text(body.dueDate),
    notes: text(body.notes),
  });
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.delete("/api/orgs/:id/vbs-plan/checklist/:itemId", requireAuth, async (req, res) => {
  const result = await deleteVbsChecklistItem(
    String(req.params.id),
    req.session.user!.username,
    String(req.params.itemId),
  );
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/orgs/:id/vbs-plan/board/posts", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const result = await createBoardPost(String(req.params.id), req.session.user!.username, {
    title: text(body.title),
    body: text(body.body),
    teamId: text(body.teamId),
  });
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.status(201).json(result);
});

app.post("/api/orgs/:id/vbs-plan/board/posts/:postId/replies", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const text = typeof body.body === "string" ? body.body : "";
  const result = await createBoardReply(
    String(req.params.id),
    req.session.user!.username,
    String(req.params.postId),
    text,
  );
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.status(201).json(result);
});

app.get("/api/profile/notifications", requireAuth, async (req, res) => {
  const result = await getNotificationProfile(req.session.user!.username);
  res.json(result);
});

app.get("/api/profile/contact", requireAuth, async (req, res) => {
  const result = await getUserContact(req.session.user!.username);
  if ("error" in result) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});

app.patch("/api/profile/contact", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const result = await saveUserContact(req.session.user!.username, {
    email: typeof body.email === "string" ? body.email : "",
    phone: typeof body.phone === "string" ? body.phone : "",
    firstName: typeof body.firstName === "string" ? body.firstName : "",
    lastName: typeof body.lastName === "string" ? body.lastName : "",
  });
  if ("error" in result) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});

app.patch("/api/orgs/:id/profile/notifications", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const result = await updateOrgNotificationProfile(String(req.params.id), req.session.user!.username, {
    notifyEmail: typeof body.notifyEmail === "boolean" ? body.notifyEmail : undefined,
    notifySms: typeof body.notifySms === "boolean" ? body.notifySms : undefined,
    notifyBoardInApp: typeof body.notifyBoardInApp === "boolean" ? body.notifyBoardInApp : undefined,
    notifyBoardEmail: typeof body.notifyBoardEmail === "boolean" ? body.notifyBoardEmail : undefined,
    notifyBoardSms: typeof body.notifyBoardSms === "boolean" ? body.notifyBoardSms : undefined,
    boardSubscribeOrg: typeof body.boardSubscribeOrg === "boolean" ? body.boardSubscribeOrg : undefined,
    subscribedTeamIds: Array.isArray(body.subscribedTeamIds)
      ? body.subscribedTeamIds.filter((id): id is string => typeof id === "string")
      : undefined,
    mutedUsernames: Array.isArray(body.mutedUsernames)
      ? body.mutedUsernames.filter((id): id is string => typeof id === "string")
      : undefined,
  });
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.patch("/api/orgs/:id/vbs-plan/notification-prefs", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const result = await updateVbsNotificationPrefs(String(req.params.id), req.session.user!.username, {
    notifyEmail: body.notifyEmail !== false,
    notifySms: body.notifySms === true,
  });
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.patch("/api/orgs/:id/vbs-plan/calendar-view", requireAuth, async (req, res) => {
  const body = req.body as { view?: unknown };
  const view = body.view;
  if (view !== "day" && view !== "week" && view !== "month") {
    res.status(400).json({ error: "view must be day, week, or month" });
    return;
  }
  const result = await updateCalendarViewPref(String(req.params.id), req.session.user!.username, view);
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

app.put("/api/orgs/:id/vbs-plan/calendar-reminders", requireAuth, async (req, res) => {
  const body = req.body as {
    itemType?: unknown;
    itemId?: unknown;
    reminders?: unknown;
  };
  const itemType = body.itemType;
  if (itemType !== "task" && itemType !== "schedule" && itemType !== "plan_start" && itemType !== "plan_end") {
    res.status(400).json({ error: "Invalid itemType" });
    return;
  }
  if (typeof body.itemId !== "string" || !body.itemId) {
    res.status(400).json({ error: "itemId required" });
    return;
  }
  const reminders = Array.isArray(body.reminders)
    ? body.reminders
        .filter((item): item is Record<string, unknown> => item && typeof item === "object")
        .map((item) => ({
          minutesBefore: Number(item.minutesBefore),
          notifyEmail: item.notifyEmail !== false,
          notifySms: item.notifySms === true,
        }))
        .filter((item) => Number.isFinite(item.minutesBefore))
    : [];
  const result = await saveCalendarReminders(String(req.params.id), req.session.user!.username, {
    itemType,
    itemId: body.itemId,
    reminders,
  });
  if ("error" in result) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
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
  const body = req.body as { emails?: unknown; role?: unknown };
  const result = await createInvites(
    String(req.params.id),
    req.session.user!.username,
    typeof body.emails === "string" ? body.emails : "",
    typeof body.role === "string" ? body.role : "org_read",
  );
  if ("error" in result) {
    const message = result.error ?? "Error";
    const status =
      message === "Organization not found" ? 404 : message.includes("admin") ? 403 : 400;
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

app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
  const marked = await markAllNotificationsRead(req.session.user!.username);
  res.json({
    ok: true,
    unread: await unreadNotificationCount(req.session.user!.username),
    marked,
  });
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
        .filter((file) => isAcceptableAttachment(file))
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
    .filter((file) => isAcceptableAttachment(file))
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
  const username = req.session.user!.username;
  const platformAdmin = await isPlatformAdmin(username);
  res.json({ teams: await listTeamsForViewer(req.tenantId, username, platformAdmin) });
});

app.get("/api/users", requireAuth, attachTenant, async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q : "";
  const scope = req.query.scope === "all" ? null : req.tenantId;
  const includeSelf = req.query.includeSelf === "1";
  const exclude = includeSelf ? undefined : req.session.user!.username;
  res.json(await searchUsers(query, exclude, scope));
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
  const username = req.session.user!.username;
  if (!(await userCanAccessObjectKey(username, key))) {
    res.status(404).json({ error: "File not found" });
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
  void processCalendarReminders().catch(() => undefined);
  setInterval(() => {
    void processCalendarReminders().catch(() => undefined);
  }, 60_000);
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
