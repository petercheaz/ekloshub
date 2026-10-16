import type {
  AppNotification,
  CurriculumPayload,
  DirectMessage,
  MessageThread,
  OrgDetail,
  Organization,
  OrgInvite,
  OrgRole,
  OrgTeam,
  Review,
  RoomIdea,
  RoomIdeaImage,
  RoomIdeaOptions,
  ReviewDraft,
  ShareDraft,
  ShareListing,
  SharePayload,
  SetupDraft,
  SetupPost,
  SetupPayload,
  User,
  UserSuggestion,
  UserVbsCurriculum,
  UserVbsDefaultPayload,
  OrgVbsCurriculum,
  OrgVbsDefaultPayload,
  OrgVbsEventsPayload,
  PhotoshoppeBrowseResult,
  VbsPlan,
  VbsPlanWorkspace,
  VbsRegistrationStudent,
  VbsRegistrationWorkspace,
  PublicFamilyPage,
  PublicRegistrationForm,
} from "./types";
import type { EditorSnapshot } from "./photoshoppe/types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let currentTenantId: string | null = null;
let currentVbsEventId: string | null = null;

export function setApiTenant(id: string | null) {
  currentTenantId = id;
}

export function setApiVbsEvent(id: string | null) {
  currentVbsEventId = id;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(currentTenantId ? { "X-Tenant-Id": currentTenantId } : {}),
      ...(currentVbsEventId ? { "X-Vbs-Event-Id": currentVbsEventId } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // ignore unreadable error bodies
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}

function withYear(path: string, year?: number) {
  const params = new URLSearchParams();
  if (currentVbsEventId) {
    params.set("eventId", currentVbsEventId);
  } else if (year) {
    params.set("year", String(year));
  }
  const qs = params.toString();
  if (!qs) {
    return path;
  }
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}${qs}`;
}

async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // ignore
    }
    throw new ApiError(response.status, message);
  }
  return (await response.json()) as T;
}

export const api = {
  me: () => request<{ user: User | null }>("/api/me"),
  login: (username: string, password: string) =>
    request<User>("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>("/api/logout", { method: "POST" }),
  organizations: () => request<{ organizations: Organization[] }>("/api/orgs"),
  organization: (id: string) => request<OrgDetail>(`/api/orgs/${id}`),
  seasonCopyOptions: (orgId: string) =>
    request<import("./SeasonCopyPanel").SeasonCopyOptions>(`/api/orgs/${orgId}/season-copy`),
  copyVbsSeason: (
    orgId: string,
    input: {
      fromYear: number;
      toYear: number;
      name?: string;
      fromEventId?: string;
      startDate?: string;
      endDate?: string;
      publisherId?: string;
      programTitle?: string;
    },
  ) =>
    request<{
      ok: boolean;
      fromYear: number;
      toYear: number;
      startDate: string;
      endDate: string;
      copied: {
        stations: number;
        tasks: number;
        scheduleSlots: number;
        checklistItems: number;
        supplies: number;
        registrationClasses: number;
      };
    }>(`/api/orgs/${orgId}/season-copy`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  saveSeasonSnapshot: (orgId: string) =>
    request<{ ok: boolean; seasonYear: number }>(`/api/orgs/${orgId}/season-snapshot`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  volunteerCompliance: (orgId: string, year?: number) =>
    request<import("./types").VolunteerComplianceWorkspace>(
      withYear(`/api/orgs/${orgId}/volunteer-compliance`, year),
    ),
  updateVolunteerBackgroundCheck: (orgId: string, username: string, status: string, year?: number) =>
    request<import("./types").VolunteerComplianceWorkspace>(
      withYear(`/api/orgs/${orgId}/volunteer-compliance/${encodeURIComponent(username)}`, year),
      { method: "PATCH", body: JSON.stringify({ status }) },
    ),
  createOrganization: (input: { name: string; address: string; contact: string }) =>
    request<Organization>("/api/orgs", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteOrganization: (id: string) => request<{ ok: boolean }>(`/api/orgs/${id}`, { method: "DELETE" }),
  addOrganizationMember: (id: string, username: string, role: OrgRole) =>
    request<OrgDetail>(`/api/orgs/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ username, role }),
    }),
  updateOrganizationMember: (
    id: string,
    username: string,
    input: {
      role: OrgRole;
      firstName: string;
      lastName: string;
      phone: string;
      email: string;
      verified: boolean;
      newPassword?: string;
      resetPasswordToDefault?: boolean;
      teamAdminTeamIds?: string[];
      vbsSeasonYear?: number;
      restoreMember?: boolean;
    },
  ) =>
    request<OrgDetail>(`/api/orgs/${id}/members/${encodeURIComponent(username)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  removeOrganizationMember: (id: string, username: string) =>
    request<OrgDetail>(`/api/orgs/${id}/members/${encodeURIComponent(username)}`, { method: "DELETE" }),
  orgContactOptions: (orgId: string) => request<import("./types").OrgContactOptions>(`/api/orgs/${orgId}/contact`),
  sendOrgContact: (
    orgId: string,
    input: { subject: string; message: string; scope: "organization" | "teams"; teamIds?: string[] },
  ) =>
    request<{ ok: boolean; recipientCount: number }>(`/api/orgs/${orgId}/contact`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  sendParentContact: (
    orgId: string,
    input: { subject: string; message: string; scope: "all" | "class"; classId?: string },
  ) =>
    request<{ ok: boolean; recipientCount: number; skippedNoEmail?: number }>(
      `/api/orgs/${orgId}/contact/parents`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  inviteToOrganization: (id: string, emails: string, role: import("./types").OrgRole = "org_read") =>
    request<{ invites: OrgInvite[] }>(`/api/orgs/${id}/invites`, {
      method: "POST",
      body: JSON.stringify({ emails, role }),
    }),
  invite: (token: string, email: string) =>
    request<{ organizationName: string; email: string; existingUser: boolean; accepted: boolean }>(
      `/api/invites/${token}?${new URLSearchParams({ email })}`,
    ),
  acceptInvite: (token: string, input: {
    email: string;
    secret: string;
    firstName: string;
    lastName: string;
    phone: string;
    password: string;
  }) =>
    request<User & { organizationId: string }>(`/api/invites/${token}/accept`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  notifications: () => request<{ notifications: AppNotification[]; unread: number }>("/api/notifications"),
  readNotification: (id: string) =>
    request<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: "POST" }),
  readAllNotifications: () =>
    request<{ ok: boolean; unread: number; marked: number }>(`/api/notifications/read-all`, {
      method: "POST",
    }),
  userContact: () =>
    request<{ username: string; email: string; phone: string; firstName: string; lastName: string }>(
      "/api/profile/contact",
    ),
  saveUserContact: (input: { email: string; phone: string; firstName: string; lastName: string }) =>
    request<{ username: string; email: string; phone: string; firstName: string; lastName: string }>(
      "/api/profile/contact",
      { method: "PATCH", body: JSON.stringify(input) },
    ),
  teams: () => request<{ teams: OrgTeam[] }>("/api/teams"),
  createTeam: (orgId: string, name: string, members: string, teamAdminUsername?: string) =>
    request<OrgTeam>(`/api/orgs/${orgId}/teams`, {
      method: "POST",
      body: JSON.stringify({ name, members, teamAdminUsername }),
    }),
  updateTeam: (orgId: string, teamId: string, name: string, members: string, teamAdminUsername: string) =>
    request<OrgTeam>(`/api/orgs/${orgId}/teams/${teamId}`, {
      method: "PATCH",
      body: JSON.stringify({ name, members, teamAdminUsername }),
    }),
  roomIdeas: (orgId: string) => request<RoomIdeaOptions>(`/api/orgs/${orgId}/room-ideas`),
  generateRoomIdeas: (orgId: string, input: {
    publisherId: string;
    year: number;
    title: string;
    notes: string;
    sourceImage: string;
    count?: number;
  }) =>
    request<{ images: RoomIdeaImage[] }>(`/api/orgs/${orgId}/room-ideas/generate`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  saveRoomIdea: (orgId: string, input: {
    publisherId: string;
    year: number;
    title: string;
    notes: string;
    sourceImage: string;
    imageKeys: string[];
  }) =>
    request<RoomIdea>(`/api/orgs/${orgId}/room-ideas`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  shareRoomIdea: (orgId: string, ideaId: string, input: { teamIds: string[]; usernames: string; publicSetup: boolean }) =>
    request<{ ok: boolean }>(`/api/orgs/${orgId}/room-ideas/${ideaId}/share`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  browsePhotoshoppe: (orgId: string, folderId?: string | null) => {
    const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
    return request<PhotoshoppeBrowseResult>(`/api/orgs/${orgId}/photoshoppe${query}`);
  },
  createPhotoshoppeFolder: (orgId: string, parentId: string | null, name: string) =>
    request<{ folder: { id: string; name: string; updatedAt: string } }>(`/api/orgs/${orgId}/photoshoppe/folders`, {
      method: "POST",
      body: JSON.stringify({ parentId, name }),
    }),
  savePhotoshoppeDocument: (
    orgId: string,
    input: {
      parentId: string | null;
      name: string;
      documentId?: string;
      snapshot: EditorSnapshot;
      preview: { name: string; type: string; size: number; dataUrl: string };
    },
  ) =>
    request<{ document: PhotoshoppeBrowseResult["documents"][number] }>(
      `/api/orgs/${orgId}/photoshoppe/documents`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    ),
  loadPhotoshoppeDocument: (orgId: string, documentId: string) =>
    request<{ snapshot: EditorSnapshot; document: PhotoshoppeBrowseResult["documents"][number] }>(
      `/api/orgs/${orgId}/photoshoppe/documents/${documentId}`,
    ),
  userVbsDefault: () => request<UserVbsDefaultPayload>("/api/me/vbs-default"),
  saveUserVbsDefault: (input: {
    year: number;
    publisherId: string;
    programTitle: string;
    allFilters?: boolean;
  }) =>
    request<{ userDefault: UserVbsCurriculum }>("/api/me/vbs-default", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  orgVbsEvents: (orgId: string) => request<OrgVbsEventsPayload>(`/api/orgs/${orgId}/vbs-events`),
  setCurrentVbsEvent: (orgId: string, eventId: string) =>
    request<OrgVbsEventsPayload>(`/api/orgs/${orgId}/vbs-events/current`, {
      method: "POST",
      body: JSON.stringify({ eventId }),
    }),
  setPersonalVbsEventDefault: (orgId: string, eventId: string) =>
    request<OrgVbsEventsPayload>(`/api/orgs/${orgId}/vbs-events/default`, {
      method: "PUT",
      body: JSON.stringify({ eventId }),
    }),
  createVbsEvent: (
    orgId: string,
    input: { fromEventId?: string; year?: number; name?: string; startDate?: string; endDate?: string; makeCurrent?: boolean },
  ) =>
    request<OrgVbsEventsPayload>(`/api/orgs/${orgId}/vbs-events`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  renameVbsEvent: (orgId: string, eventId: string, name: string) =>
    request<OrgVbsEventsPayload>(`/api/orgs/${orgId}/vbs-events/${encodeURIComponent(eventId)}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    }),
  deleteVbsEvent: (orgId: string, eventId: string) =>
    request<OrgVbsEventsPayload>(`/api/orgs/${orgId}/vbs-events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
    }),
  orgVbsDefault: (orgId: string) => request<OrgVbsDefaultPayload>(`/api/orgs/${orgId}/vbs-default`),
  saveOrgVbsDefault: (orgId: string, input: { year: number; publisherId: string; programTitle: string }) =>
    request<{ orgDefault: OrgVbsCurriculum }>(`/api/orgs/${orgId}/vbs-default`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  publicRegistrationForm: (token: string) =>
    publicRequest<PublicRegistrationForm>(`/api/public/register/${encodeURIComponent(token)}`),
  submitPublicRegistration: (token: string, input: Record<string, unknown>) =>
    publicRequest<{ ok: boolean; confirmationId: string; childFullName: string }>(
      `/api/public/register/${encodeURIComponent(token)}`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  updateVbsRegistrationPublic: (
    orgId: string,
    input: { enabled?: boolean; regenerateToken?: boolean },
  ) =>
    request<{ enabled: boolean; link: string }>(`/api/orgs/${orgId}/vbs-registration/public`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  publicFamilyPage: (token: string) =>
    publicRequest<PublicFamilyPage>(`/api/public/family/${encodeURIComponent(token)}`),
  updateVbsRegistrationFamilyPage: (
    orgId: string,
    input: { enabled?: boolean; regenerateToken?: boolean },
  ) =>
    request<{ enabled: boolean; link: string }>(`/api/orgs/${orgId}/vbs-registration/family-page`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  vbsRegistration: (orgId: string, year?: number) =>
    request<VbsRegistrationWorkspace>(withYear(`/api/orgs/${orgId}/vbs-registration`, year)),
  saveVbsRegistrationStudent: (orgId: string, input: Record<string, unknown>) =>
    request<{ student: VbsRegistrationStudent }>(`/api/orgs/${orgId}/vbs-registration/students`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteVbsRegistrationStudent: (orgId: string, studentId: string) =>
    request<{ ok: boolean }>(`/api/orgs/${orgId}/vbs-registration/students/${studentId}`, { method: "DELETE" }),
  generateVbsRegistrationNametag: (
    orgId: string,
    studentId: string,
    input: {
      publisherId: string;
      year: number;
      title: string;
      extraInstructions?: string;
      assignedTeamId?: string;
    },
  ) =>
    request<{ student: VbsRegistrationStudent; image: { key: string; url: string } }>(
      `/api/orgs/${orgId}/vbs-registration/students/${studentId}/nametag`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  saveVbsRegistrationClass: (orgId: string, input: Record<string, unknown>) =>
    request<{ classes: import("./types").VbsRegistrationClass[] }>(`/api/orgs/${orgId}/vbs-registration/classes`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteVbsRegistrationClass: (orgId: string, classId: string) =>
    request<{ ok: boolean }>(`/api/orgs/${orgId}/vbs-registration/classes/${classId}`, { method: "DELETE" }),
  assignVbsRegistrationStudentClass: (orgId: string, studentId: string, classId: string | null) =>
    request<{ ok: boolean }>(`/api/orgs/${orgId}/vbs-registration/students/${studentId}/class`, {
      method: "PATCH",
      body: JSON.stringify({ classId }),
    }),
  assignVbsRegistrationClassStaff: (
    orgId: string,
    classId: string,
    input: { username: string; role: "leader" | "teacher" | "helper" },
  ) =>
    request<{ ok: boolean }>(`/api/orgs/${orgId}/vbs-registration/classes/${classId}/staff`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  removeVbsRegistrationClassStudent: (orgId: string, classId: string, studentId: string) =>
    request<{ ok: boolean }>(
      `/api/orgs/${orgId}/vbs-registration/classes/${classId}/students/${encodeURIComponent(studentId)}`,
      { method: "DELETE" },
    ),
  removeVbsRegistrationClassStaff: (orgId: string, classId: string, username: string) =>
    request<{ ok: boolean }>(
      `/api/orgs/${orgId}/vbs-registration/classes/${classId}/staff/${encodeURIComponent(username)}`,
      { method: "DELETE" },
    ),
  reorderVbsRegistrationClasses: (orgId: string, classIds: string[]) =>
    request<{ ok: boolean }>(`/api/orgs/${orgId}/vbs-registration/classes/order`, {
      method: "PATCH",
      body: JSON.stringify({ classIds }),
    }),
  autoAssignVbsRegistrationStudentsByAge: (orgId: string) =>
    request<{ ok: boolean; placedStudents: number; unplaced: { name: string; age: number }[] }>(
      `/api/orgs/${orgId}/vbs-registration/classes/auto-assign-students-by-age`,
      { method: "POST" },
    ),
  reorderVbsRegistrationClassStudents: (
    orgId: string,
    classId: string | null,
    studentIds: string[],
  ) =>
    request<{ ok: boolean }>(
      classId
        ? `/api/orgs/${orgId}/vbs-registration/classes/${classId}/students/order`
        : `/api/orgs/${orgId}/vbs-registration/students/unassigned/order`,
      { method: "PATCH", body: JSON.stringify({ studentIds }) },
    ),
  reorderVbsRegistrationClassStaff: (
    orgId: string,
    classId: string,
    role: "leader" | "teacher" | "helper",
    usernames: string[],
  ) =>
    request<{ ok: boolean }>(`/api/orgs/${orgId}/vbs-registration/classes/${classId}/staff/order`, {
      method: "PATCH",
      body: JSON.stringify({ role, usernames }),
    }),
  vbsRegistrationCooking: (orgId: string) =>
    request<{
      cookingTeamId: string;
      teams: { id: string; name: string }[];
      canConfigureCooking: boolean;
      extraInstructions: string;
      menuText: string;
      menuUpdatedAt: string;
      menuDays: { id: string; label: string; body: string }[];
    }>(`/api/orgs/${orgId}/vbs-registration/cooking`),
  saveVbsRegistrationCooking: (
    orgId: string,
    input: { cookingTeamId?: string; extraInstructions?: string },
  ) =>
    request<{
      cookingTeamId: string;
      teams: { id: string; name: string }[];
      canConfigureCooking: boolean;
      extraInstructions: string;
      menuText: string;
      menuUpdatedAt: string;
    }>(`/api/orgs/${orgId}/vbs-registration/cooking`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  cookingPlan: (orgId: string, year?: number) =>
    request<import("./types-cooking-plan").CookingPlanWorkspace>(
      withYear(`/api/orgs/${orgId}/cooking-plan`, year),
    ),
  saveCookingPlanSettings: (
    orgId: string,
    input: { cookingTeamId?: string; extraInstructions?: string },
  ) =>
    request<import("./types-cooking-plan").CookingPlanWorkspace>(`/api/orgs/${orgId}/cooking-plan`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  saveCookingPlanLayout: (orgId: string, plan: import("./types-cooking-plan").CookingPlanDocument) =>
    request<import("./types-cooking-plan").CookingPlanWorkspace>(`/api/orgs/${orgId}/cooking-plan/layout`, {
      method: "PUT",
      body: JSON.stringify(plan),
    }),
  generateCookingPlan: (
    orgId: string,
    input: { publisherId: string; year: number; title: string; replaceItemIds?: string[] },
  ) =>
    request<{
      plan: import("./types-cooking-plan").CookingPlanDocument;
      generatedAt: string;
      replacedItemCount: number;
    }>(`/api/orgs/${orgId}/cooking-plan/generate`, { method: "POST", body: JSON.stringify(input) }),
  generateVbsRegistrationSnacksMenu: (
    orgId: string,
    input: {
      publisherId: string;
      year: number;
      title: string;
      regenerateDays?: string[];
      dayHints?: Record<string, string>;
    },
  ) =>
    request<{ menuText: string; generatedAt: string; regeneratedDays: string[]; partial: boolean }>(
      `/api/orgs/${orgId}/vbs-registration/cooking/generate-menu`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  vbsPlan: (orgId: string, year?: number) =>
    request<VbsPlanWorkspace>(withYear(`/api/orgs/${orgId}/vbs-plan`, year)),
  vbsReimbursementQueue: (orgId: string) =>
    request<{
      queue: {
        taskId: string;
        title: string;
        expenseAmount: number;
        assignedUsername: string;
        dueDate: string;
        attachments: import("./types").VbsTaskAttachment[];
      }[];
      totalPendingAmount: number;
      reimbursedAwaitingArchive: number;
    }>(`/api/orgs/${orgId}/vbs-plan/reimbursements`),
  markVbsTaskReimbursed: (orgId: string, taskId: string) =>
    request<{
      queue: {
        taskId: string;
        title: string;
        expenseAmount: number;
        assignedUsername: string;
        dueDate: string;
        attachments: import("./types").VbsTaskAttachment[];
      }[];
      totalPendingAmount: number;
      reimbursedAwaitingArchive: number;
    }>(`/api/orgs/${orgId}/vbs-plan/reimbursements/${taskId}/reimbursed`, { method: "POST" }),
  closeVbsReimbursementCycle: (orgId: string) =>
    request<{
      ok: boolean;
      archivedCount: number;
      queue: {
        taskId: string;
        title: string;
        expenseAmount: number;
        assignedUsername: string;
        dueDate: string;
        attachments: import("./types").VbsTaskAttachment[];
      }[];
      totalPendingAmount: number;
      reimbursedAwaitingArchive: number;
    }>(`/api/orgs/${orgId}/vbs-plan/reimbursements/close-cycle`, { method: "POST" }),
  saveVbsWorksheet: (orgId: string, worksheetData: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/api/orgs/${orgId}/vbs-plan/worksheet`, {
      method: "PATCH",
      body: JSON.stringify({ worksheetData }),
    }),
  saveVbsPlan: (orgId: string, input: Record<string, unknown>) =>
    request<{ plan: VbsPlan }>(`/api/orgs/${orgId}/vbs-plan`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  saveVbsTask: (orgId: string, input: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/api/orgs/${orgId}/vbs-plan/tasks`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteVbsTask: (orgId: string, taskId: string) =>
    request<{ ok: boolean }>(`/api/orgs/${orgId}/vbs-plan/tasks/${taskId}`, { method: "DELETE" }),
  saveVbsStation: (orgId: string, input: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/api/orgs/${orgId}/vbs-plan/stations`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteVbsStation: (orgId: string, stationId: string) =>
    request<{ ok: boolean }>(`/api/orgs/${orgId}/vbs-plan/stations/${stationId}`, { method: "DELETE" }),
  saveVbsScheduleSlot: (orgId: string, input: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/api/orgs/${orgId}/vbs-plan/schedule`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteVbsScheduleSlot: (orgId: string, slotId: string) =>
    request<{ ok: boolean }>(`/api/orgs/${orgId}/vbs-plan/schedule/${slotId}`, { method: "DELETE" }),
  saveVbsSupplyItem: (orgId: string, input: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/api/orgs/${orgId}/vbs-plan/supplies`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteVbsSupplyItem: (orgId: string, itemId: string) =>
    request<{ ok: boolean }>(`/api/orgs/${orgId}/vbs-plan/supplies/${itemId}`, { method: "DELETE" }),
  generateVbsDailySchedule: (orgId: string, replace = false) =>
    request<{ ok: boolean }>(`/api/orgs/${orgId}/vbs-plan/schedule/generate`, {
      method: "POST",
      body: JSON.stringify({ replace }),
    }),
  addScheduleActivityLabel: (orgId: string, label: string) =>
    request<{ ok: boolean; labels: string[] }>(`/api/orgs/${orgId}/vbs-plan/schedule-activities`, {
      method: "POST",
      body: JSON.stringify({ label }),
    }),
  removeScheduleActivityLabel: (orgId: string, label: string) =>
    request<{ ok: boolean; labels: string[] }>(
      `/api/orgs/${orgId}/vbs-plan/schedule-activities/${encodeURIComponent(label)}`,
      { method: "DELETE" },
    ),
  saveVbsChecklistItem: (orgId: string, input: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/api/orgs/${orgId}/vbs-plan/checklist`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteVbsChecklistItem: (orgId: string, itemId: string) =>
    request<{ ok: boolean }>(`/api/orgs/${orgId}/vbs-plan/checklist/${itemId}`, { method: "DELETE" }),
  createVbsBoardPost: (orgId: string, input: { title: string; body: string; teamId: string }) =>
    request<{ post: import("./types").VbsBoardPost }>(`/api/orgs/${orgId}/vbs-plan/board/posts`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createVbsBoardReply: (orgId: string, postId: string, body: string) =>
    request<{ reply: import("./types").VbsBoardReply }>(
      `/api/orgs/${orgId}/vbs-plan/board/posts/${postId}/replies`,
      { method: "POST", body: JSON.stringify({ body }) },
    ),
  notificationProfile: () =>
    request<{ organizations: import("./types").OrgNotificationSettings[] }>(`/api/profile/notifications`),
  saveOrgNotificationProfile: (orgId: string, input: Record<string, unknown>) =>
    request<{ organizations: import("./types").OrgNotificationSettings[] }>(
      `/api/orgs/${orgId}/profile/notifications`,
      { method: "PATCH", body: JSON.stringify(input) },
    ),
  vbsNotificationPrefs: (orgId: string, input: { notifyEmail: boolean; notifySms: boolean }) =>
    request<{ notificationPrefs: { notifyEmail: boolean; notifySms: boolean } }>(
      `/api/orgs/${orgId}/vbs-plan/notification-prefs`,
      { method: "PATCH", body: JSON.stringify(input) },
    ),
  vbsCalendarView: (orgId: string, view: "day" | "week" | "month") =>
    request<{ calendarDefaultView: "day" | "week" | "month" }>(
      `/api/orgs/${orgId}/vbs-plan/calendar-view`,
      { method: "PATCH", body: JSON.stringify({ view }) },
    ),
  saveVbsCalendarReminders: (
    orgId: string,
    input: {
      itemType: "task" | "schedule" | "checklist" | "plan_start" | "plan_end";
      itemId: string;
      reminders: { minutesBefore: number; notifyEmail: boolean; notifySms: boolean }[];
    },
  ) =>
    request<{ reminders: import("./types").VbsCalendarReminder[] }>(
      `/api/orgs/${orgId}/vbs-plan/calendar-reminders`,
      { method: "PUT", body: JSON.stringify(input) },
    ),
  curriculum: (year: number | null, publisherIds: string[] | null) => {
    const params = new URLSearchParams();
    if (year) {
      params.set("year", String(year));
    }
    if (publisherIds === null) {
      params.set("publishers", "all");
    } else {
      params.set("publishers", publisherIds.length > 0 ? publisherIds.join(",") : "none");
    }
    return request<CurriculumPayload>(`/api/curriculum?${params.toString()}`);
  },
  addReview: (draft: ReviewDraft) =>
    request<Review>("/api/reviews", {
      method: "POST",
      body: JSON.stringify(draft),
    }),
  shares: () => request<SharePayload>("/api/shares"),
  addShare: (draft: ShareDraft) =>
    request<ShareListing>("/api/shares", {
      method: "POST",
      body: JSON.stringify(draft),
    }),
  setups: () => request<SetupPayload>("/api/setups"),
  addSetup: (draft: SetupDraft) =>
    request<SetupPost>("/api/setups", {
      method: "POST",
      body: JSON.stringify(draft),
    }),
  deleteSetup: (id: string) => request<{ ok: boolean }>(`/api/setups/${id}`, { method: "DELETE" }),
  addSetupComment: (id: string, body: string) =>
    request<SetupPost>(`/api/setups/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  deleteSetupComment: (commentId: string) =>
    request<{ ok: boolean }>(`/api/setups/comments/${commentId}`, { method: "DELETE" }),
  searchUsers: (q: string, options?: { all?: boolean; includeSelf?: boolean }) => {
    const params = new URLSearchParams({ q });
    if (options?.all) {
      params.set("scope", "all");
    }
    if (options?.includeSelf) {
      params.set("includeSelf", "1");
    }
    return request<UserSuggestion[]>(`/api/users?${params}`);
  },
  unreadCount: () => request<{ count: number }>("/api/messages/unread-count"),
  messageThreads: () => request<MessageThread[]>("/api/messages"),
  messageThread: (threadId: string) => request<DirectMessage[]>(`/api/messages/${threadId}`),
  sendMessage: (to: string[], body: string, teams: string[] = []) =>
    request<DirectMessage>("/api/messages", {
      method: "POST",
      body: JSON.stringify({ to, body, teams }),
    }),
  replyMessage: (threadId: string, body: string, all: boolean) =>
    request<DirectMessage>(`/api/messages/${threadId}/reply`, {
      method: "POST",
      body: JSON.stringify({ body, all }),
    }),
  markThreadRead: (threadId: string) =>
    request<DirectMessage[]>(`/api/messages/${threadId}/read`, { method: "POST" }),
  markThreadUnread: (threadId: string) =>
    request<DirectMessage[]>(`/api/messages/${threadId}/unread`, { method: "POST" }),
  deleteThread: (threadId: string) =>
    request<{ ok: boolean }>(`/api/messages/${threadId}`, { method: "DELETE" }),
};
