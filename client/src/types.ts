export type User = {
  username: string;
  verified: boolean;
  platformAdmin: boolean;
};

export type UserSuggestion = {
  username: string;
  email: string;
};

export type OrgRole = "org_admin" | "org_write" | "org_read";

export type Organization = {
  id: string;
  name: string;
  address: string;
  contact: string;
  createdBy: string;
  createdAt: string;
  role: OrgRole | null;
};

export type OrgMember = {
  username: string;
  role: OrgRole;
};

export type OrgInvite = {
  id: string;
  email: string;
  token: string;
  keyword: string;
  link: string;
  createdAt: string;
  acceptedAt: string | null;
};

export type OrgTeam = {
  id: string;
  organizationId: string;
  name: string;
  members: string;
  memberUsernames: string[];
  createdAt: string;
};

export type OrgDetail = {
  organization: Organization;
  members: OrgMember[];
  invitations: OrgInvite[];
  teams: OrgTeam[];
};

export type RoomIdeaImage = {
  key: string;
  url: string;
};

export type RoomIdea = {
  id: string;
  organizationId: string;
  username: string;
  year: number;
  publisherId: string;
  publisherName: string;
  title: string;
  notes: string;
  sourceUrl: string;
  images: RoomIdeaImage[];
  createdAt: string;
};

export type RoomIdeaOptions = {
  defaultYear: number;
  publishers: Publisher[];
  programs: ShareProgram[];
  ideas: RoomIdea[];
};

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  link: string;
  createdAt: string;
  read: boolean;
};

export type Publisher = {
  id: string;
  name: string;
};

export type Review = {
  id: string;
  programId: string;
  username: string;
  verified: boolean;
  createdAt: string;
  whatPeopleSay: string;
  biblicalTeaching: number;
  biblicalTeachingNotes: string;
  merchHelp: number;
  merchHelpNotes: string;
  fun: number;
  funNotes: string;
  criticisms: string;
  cost: string;
};

export type Program = {
  id: string;
  year: number;
  publisherId: string;
  publisherName: string;
  theme: string;
  reviews: Review[];
};

export type CurriculumPayload = {
  defaultYear: number;
  years: number[];
  publishers: Publisher[];
  programs: Program[];
};

export type ShareAttachment = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

export type ShareListing = {
  id: string;
  year: number;
  publisherId: string;
  publisherName: string;
  title: string;
  item: string;
  details: string;
  availableOn: string;
  contact: string;
  location: string;
  videoUrl: string;
  attachments: ShareAttachment[];
  username: string;
  verified: boolean;
  createdAt: string;
};

export type ShareProgram = {
  id: string;
  year: number;
  publisherId: string;
  theme: string;
};

export type SharePayload = {
  defaultYear: number;
  publishers: Publisher[];
  programs: ShareProgram[];
  listings: ShareListing[];
};

export type ShareDraft = {
  year: number;
  publisherId: string;
  title: string;
  item: string;
  details: string;
  availableOn: string;
  contact: string;
  location: string;
  videoUrl: string;
  attachments: ShareAttachment[];
};

export type DirectMessage = {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  body: string;
  createdAt: string;
  unread: boolean;
};

export type MessageThread = {
  threadId: string;
  latest: DirectMessage;
  unread: boolean;
  participants: string[];
  teamName?: string;
};

export type SetupComment = {
  id: string;
  postId: string;
  username: string;
  verified: boolean;
  body: string;
  createdAt: string;
};

export type SetupPost = {
  id: string;
  year: number;
  publisherId: string;
  publisherName: string;
  title: string;
  body: string;
  videoUrl: string;
  pictures: ShareAttachment[];
  attachments: ShareAttachment[];
  username: string;
  verified: boolean;
  createdAt: string;
  comments: SetupComment[];
};

export type SetupPayload = {
  defaultYear: number;
  publishers: Publisher[];
  programs: ShareProgram[];
  posts: SetupPost[];
};

export type SetupDraft = {
  year: number;
  publisherId: string;
  title: string;
  body: string;
  videoUrl: string;
  pictures: ShareAttachment[];
  attachments: ShareAttachment[];
};

export type VbsTaskStatus = "todo" | "in_progress" | "done" | "blocked";
export type VbsReimbursementStatus = "none" | "pending" | "submitted" | "reimbursed" | "denied";

export type VbsTaskAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};
export type VbsTaskCategory =
  | "planning"
  | "volunteers"
  | "curriculum"
  | "supplies"
  | "safety"
  | "communications";

export type VbsPlan = {
  id: string;
  organizationId: string;
  year: number;
  title: string;
  publisherId: string;
  programTitle: string;
  location: string;
  startDate: string;
  endDate: string;
  dailyStart: string;
  dailyEnd: string;
  expectedKids: number;
  coordinatorNotes: string;
  budgetAmount: number;
  expensesAmount: number;
  worksheetData: import("./vbs-worksheet-types").PlanWorksheetData | Record<string, unknown>;
  updatedAt: string;
};

export type VbsTask = {
  id: string;
  planId: string;
  title: string;
  description: string;
  notes: string;
  category: VbsTaskCategory;
  status: VbsTaskStatus;
  dueDate: string;
  assignedUsername: string;
  assignedTeamId: string;
  sortOrder: number;
  createdAt: string;
  expenseAmount: number;
  reimbursementStatus: VbsReimbursementStatus;
  attachments: VbsTaskAttachment[];
};

export type VbsStation = {
  id: string;
  planId: string;
  name: string;
  description: string;
  defaultTeamId: string;
  sortOrder: number;
};

export type VbsScheduleSlot = {
  id: string;
  planId: string;
  dayDate: string;
  startsAt: string;
  endsAt: string;
  label: string;
  stationId: string;
  teamId: string;
  notes: string;
};

export type VbsChecklistItem = {
  id: string;
  planId: string;
  category: string;
  label: string;
  done: boolean;
  assignedTeamId: string;
  dueDate: string;
  sortOrder: number;
  notes: string;
};

export type VbsBoardReply = {
  id: string;
  postId: string;
  body: string;
  createdBy: string;
  createdAt: string;
};

export type VbsBoardPost = {
  id: string;
  planId: string;
  title: string;
  body: string;
  createdBy: string;
  createdAt: string;
  teamId: string;
  teamName?: string;
  replies: VbsBoardReply[];
};

export type OrgNotificationSettings = {
  organizationId: string;
  organizationName: string;
  notifyEmail: boolean;
  notifySms: boolean;
  notifyBoardInApp: boolean;
  notifyBoardEmail: boolean;
  notifyBoardSms: boolean;
  boardSubscribeOrg: boolean;
  subscribedTeamIds: string[];
  mutedUsernames: string[];
  teams: { id: string; name: string }[];
};

export type OrgVbsCurriculum = {
  year: number;
  publisherId: string;
  programTitle: string;
  publisherName: string;
};

export type UserVbsCurriculum = {
  year: number;
  publisherId: string;
  programTitle: string;
  publisherName: string;
  allFilters?: boolean;
};

export type UserVbsDefaultPayload = {
  userDefault: UserVbsCurriculum | null;
  defaultYear: number;
  publishers: Publisher[];
  programs: ShareProgram[];
};

export type OrgVbsDefaultPayload = {
  orgDefault: OrgVbsCurriculum | null;
  canWrite: boolean;
  defaultYear: number;
  publishers: Publisher[];
  programs: ShareProgram[];
};

export type VbsCalendarReminder = {
  id: string;
  itemType: "task" | "schedule" | "checklist" | "plan_start" | "plan_end";
  itemId: string;
  minutesBefore: number;
  notifyEmail: boolean;
  notifySms: boolean;
};

export type CalendarViewMode = "day" | "week" | "month";

export type VbsPlanWorkspace = {
  plan: VbsPlan | null;
  tasks: VbsTask[];
  stations: VbsStation[];
  schedule: VbsScheduleSlot[];
  checklist: VbsChecklistItem[];
  boardPosts: VbsBoardPost[];
  teams: OrgTeam[];
  canWrite: boolean;
  notificationPrefs: { notifyEmail: boolean; notifySms: boolean };
  calendarDefaultView: CalendarViewMode;
  calendarReminders: VbsCalendarReminder[];
  defaultYear: number;
  publishers: Publisher[];
  programs: ShareProgram[];
  taskStatuses: VbsTaskStatus[];
  taskCategories: VbsTaskCategory[];
  taskReimbursementStatuses: VbsReimbursementStatus[];
  milestoneCategories: string[];
  scheduleActivityLabels: string[];
  canAdmin: boolean;
};

export type ReviewDraft = {
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
};
