import { publishers, type PublisherId } from "./curriculum.js";
import type { ShareAttachment } from "./share.js";

export type SetupMedia = ShareAttachment;

export type SetupComment = {
  id: string;
  postId: string;
  username: string;
  body: string;
  createdAt: string;
};

export type SetupPost = {
  id: string;
  year: number;
  publisherId: PublisherId;
  title: string;
  body: string;
  videoUrl: string;
  pictures: SetupMedia[];
  attachments: SetupMedia[];
  username: string;
  createdAt: string;
};

const setupPhotoBytes: Record<string, number> = {
  "cloud-ceiling.jpg": 363256,
  "runway-lights.jpg": 177767,
  "hangar-hallway.jpg": 327939,
  "check-in-desk.jpg": 257703,
  "windshield.jpg": 405301,
  "spy-hq.jpg": 306695,
  "decoder-table.jpg": 278251,
  "briefing-hall.jpg": 252045,
  "cafe-corner.jpg": 325148,
  "snack-line.jpg": 322763,
  "menu-boards.jpg": 356671,
  "ticket-booth.jpg": 309963,
  "safari-pegs.jpg": 360285,
  "animal-banners.jpg": 347312,
  "glow-corner.jpg": 206450,
};

function picture(name: keyof typeof setupPhotoBytes): SetupMedia {
  return {
    name,
    type: "image/jpeg",
    size: setupPhotoBytes[name],
    dataUrl: "",
  };
}

export const seedSetupPosts: SetupPost[] = [
  {
    id: "setup-flight-nashville",
    year: 2027,
    publisherId: "lifeway",
    title: "Take Flight",
    body: "Cloud ceiling is up in the fellowship hall. We hung the rotation signs over the gym doors and used cheap LED strips as runway lights. Kids already want to come back for the photo.",
    videoUrl: "https://www.youtube.com/watch?v=take-flight-nashville-setup",
    pictures: [picture("cloud-ceiling.jpg"), picture("runway-lights.jpg")],
    attachments: [{ name: "take-flight-room-plan.pdf", type: "application/pdf", size: 18440, dataUrl: "" }],
    username: "maria.santos",
    createdAt: "2026-10-01T16:40:00.000Z",
  },
  {
    id: "setup-flight-dallas",
    year: 2027,
    publisherId: "lifeway",
    title: "Take Flight",
    body: "We kept the hangar look to one hallway so the sanctuary stayed clean. Paper-plane station lives in the overflow room. Sharing because the catalog photos made us think we needed more space than we did.",
    videoUrl: "",
    pictures: [picture("hangar-hallway.jpg")],
    attachments: [],
    username: "pastor.reed",
    createdAt: "2026-10-02T11:15:00.000Z",
  },
  {
    id: "setup-flight-raleigh",
    year: 2027,
    publisherId: "lifeway",
    title: "Take Flight",
    body: "Pilot check-in desk from two folding tables and a printed windshield. Not fancy, but the line moved. Video is a walk-through before first night.",
    videoUrl: "https://vimeo.com/take-flight-checkin",
    pictures: [picture("check-in-desk.jpg"), picture("windshield.jpg")],
    attachments: [],
    username: "rachel.owens",
    createdAt: "2026-10-02T19:05:00.000Z",
  },
  {
    id: "setup-spy-tulsa",
    year: 2027,
    publisherId: "answers",
    title: "Spy U",
    body: "HQ wall flats went up in the education wing. Decoder station is a folding table with clipboards. Darker lighting made the badges feel official without scaring preschool.",
    videoUrl: "https://www.youtube.com/watch?v=spy-u-hq",
    pictures: [picture("spy-hq.jpg"), picture("decoder-table.jpg")],
    attachments: [{ name: "spy-station-list.pdf", type: "application/pdf", size: 9022, dataUrl: "" }],
    username: "james.okonkwo",
    createdAt: "2026-10-01T09:20:00.000Z",
  },
  {
    id: "setup-spy-richmond",
    year: 2027,
    publisherId: "answers",
    title: "Spy U",
    body: "We used the hallway as a briefing corridor. Each door got a mission envelope. Cheap, and the older kids loved the walk.",
    videoUrl: "",
    pictures: [picture("briefing-hall.jpg")],
    attachments: [],
    username: "hannah.brooks",
    createdAt: "2026-10-02T13:50:00.000Z",
  },
  {
    id: "setup-crave-chicago",
    year: 2027,
    publisherId: "group",
    title: "Crave",
    body: "Café corner in the gym used neon poster board and real café lights from a member. Snack station is the hit. Sharing the layout because Group’s sample room is twice our square footage.",
    videoUrl: "https://www.youtube.com/watch?v=crave-cafe-corner",
    pictures: [picture("cafe-corner.jpg"), picture("snack-line.jpg")],
    attachments: [],
    username: "elena.vargas",
    createdAt: "2026-10-01T18:22:00.000Z",
  },
  {
    id: "setup-crave-milwaukee",
    year: 2027,
    publisherId: "group",
    title: "Crave",
    body: "Menu boards on foam-core, clipped to existing bulletin boards. No warehouse required. Photo dump of night one.",
    videoUrl: "",
    pictures: [picture("menu-boards.jpg")],
    attachments: [{ name: "crave-supply-run.txt", type: "text/plain", size: 420, dataUrl: "" }],
    username: "priya.shah",
    createdAt: "2026-10-02T08:11:00.000Z",
  },
  {
    id: "setup-boardwalk-boston",
    year: 2027,
    publisherId: "cokesbury",
    title: "On the Boardwalk",
    body: "Ticket booth is a painted refrigerator box. Striped runner from the craft store. The whole gym reads boardwalk without a custom backdrop.",
    videoUrl: "https://vimeo.com/boardwalk-boston",
    pictures: [picture("ticket-booth.jpg")],
    attachments: [],
    username: "grace.kim",
    createdAt: "2026-10-02T10:44:00.000Z",
  },
  {
    id: "setup-safari-omaha",
    year: 2027,
    publisherId: "concordia",
    title: "Safari Expedition",
    body: "Hats on a pegboard at check-in. Animal banners in the fellowship hall only—we left the sanctuary alone. Simple and it still photographed well.",
    videoUrl: "",
    pictures: [picture("safari-pegs.jpg"), picture("animal-banners.jpg")],
    attachments: [],
    username: "felix.ng",
    createdAt: "2026-10-02T15:18:00.000Z",
  },
  {
    id: "setup-illumination-dallas",
    year: 2026,
    publisherId: "lifeway",
    title: "Illumination Station",
    body: "Glow corners boxed after week. This is the before: black lights on a dimmer, rotation signs in the hallway, and a quiet preschool room with less glow.",
    videoUrl: "https://www.youtube.com/watch?v=illumination-dallas-setup",
    pictures: [picture("glow-corner.jpg")],
    attachments: [],
    username: "admin",
    createdAt: "2026-08-04T20:00:00.000Z",
  },
];

export const seedSetupComments: SetupComment[] = [
  {
    id: "setup-c1",
    postId: "setup-flight-nashville",
    username: "lily.chen",
    body: "Those runway lights are smart. We were about to buy an inflatable plane we do not have room for.",
    createdAt: "2026-10-01T20:05:00.000Z",
  },
  {
    id: "setup-c2",
    postId: "setup-flight-nashville",
    username: "caleb.ortiz",
    body: "What LED strip did you use? Looking at the same idea for a smaller hall.",
    createdAt: "2026-10-02T09:12:00.000Z",
  },
  {
    id: "setup-c3",
    postId: "setup-flight-dallas",
    username: "maria.santos",
    body: "Thank you for the hallway-only version. That is our constraint too.",
    createdAt: "2026-10-02T14:40:00.000Z",
  },
  {
    id: "setup-c4",
    postId: "setup-spy-tulsa",
    username: "dce.hanna",
    body: "Preschool note is helpful. We will keep the badges but skip the dark hallway for the twos.",
    createdAt: "2026-10-01T15:33:00.000Z",
  },
  {
    id: "setup-c5",
    postId: "setup-crave-chicago",
    username: "marcus.bell",
    body: "Borrowing the café-light idea. Our gym is a rectangle and this still works.",
    createdAt: "2026-10-02T07:50:00.000Z",
  },
];

export function publisherName(id: PublisherId) {
  return publishers.find((publisher) => publisher.id === id)?.name ?? id;
}
