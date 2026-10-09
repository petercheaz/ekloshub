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
