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
  VbsPlan,
  VbsPlanWorkspace,
} from "./types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let currentTenantId: string | null = null;

export function setApiTenant(id: string | null) {
  currentTenantId = id;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(currentTenantId ? { "X-Tenant-Id": currentTenantId } : {}),
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
  removeOrganizationMember: (id: string, username: string) =>
    request<OrgDetail>(`/api/orgs/${id}/members/${encodeURIComponent(username)}`, { method: "DELETE" }),
  inviteToOrganization: (id: string, emails: string) =>
    request<{ invites: OrgInvite[] }>(`/api/orgs/${id}/invites`, {
      method: "POST",
      body: JSON.stringify({ emails }),
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
  teams: () => request<{ teams: OrgTeam[] }>("/api/teams"),
  createTeam: (orgId: string, name: string, members: string) =>
    request<OrgTeam>(`/api/orgs/${orgId}/teams`, {
      method: "POST",
      body: JSON.stringify({ name, members }),
    }),
  updateTeam: (orgId: string, teamId: string, name: string, members: string) =>
    request<OrgTeam>(`/api/orgs/${orgId}/teams/${teamId}`, {
      method: "PATCH",
      body: JSON.stringify({ name, members }),
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
  orgVbsDefault: (orgId: string) => request<OrgVbsDefaultPayload>(`/api/orgs/${orgId}/vbs-default`),
  saveOrgVbsDefault: (orgId: string, input: { year: number; publisherId: string; programTitle: string }) =>
    request<{ orgDefault: OrgVbsCurriculum }>(`/api/orgs/${orgId}/vbs-default`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  vbsPlan: (orgId: string) => request<VbsPlanWorkspace>(`/api/orgs/${orgId}/vbs-plan`),
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
