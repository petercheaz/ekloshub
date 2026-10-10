import { addDaysToIsoDate, normalizeMilestoneCategory } from "../vbs-plan.js";
import { dedupeOrgTeamsByName } from "../teams.js";
import { db } from "./pool.js";

const SAMPLE_MARKER = "cornerstone-sample-v2";
const BOARD_MARKER = "cornerstone-board-v1";
const ORG_ID = "org-cornerstone-seattle";
const PLAN_ID = "vbs-plan-cornerstone-2026";

const BOARD_POST_IDS = {
  orgWelcome: "board-cornerstone-welcome",
  volunteerRoles: "board-cornerstone-volunteers",
  building: "board-cornerstone-building",
  setupCrew: "board-cornerstone-setup",
  vbsWeek: "board-cornerstone-vbs-week",
} as const;

const TEAM_IDS = {
  planning: "team-cornerstone-planning",
  building: "team-cornerstone-building",
  setup: "team-cornerstone-setup",
  vbsWeek: "team-cornerstone-vbs-week",
} as const;

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type CornerstoneMilestoneSeed = {
  category: string;
  label: string;
  team: string;
  dueOffset: number;
  done?: boolean;
};

const CORNERSTONE_MILESTONES: CornerstoneMilestoneSeed[] = [
  {
    category: "Curriculum & programming",
    label: "Curriculum kit received and inventoried",
    team: TEAM_IDS.planning,
    dueOffset: -56,
    done: true,
  },
  {
    category: "Communications & registration",
    label: "Registration roster exported after signup deadline",
    team: TEAM_IDS.planning,
    dueOffset: -21,
  },
  {
    category: "Before VBS",
    label: "Nametags printed and sorted",
    team: TEAM_IDS.vbsWeek,
    dueOffset: -7,
  },
  {
    category: "Volunteers & teams",
    label: "Volunteer background checks on file",
    team: TEAM_IDS.planning,
    dueOffset: -42,
    done: true,
  },
  {
    category: "Supplies & decorations",
    label: "Rainforest flats stored and labeled",
    team: TEAM_IDS.building,
    dueOffset: -21,
    done: true,
  },
  {
    category: "Facilities & safety",
    label: "Main stage backdrop hung and lit",
    team: TEAM_IDS.building,
    dueOffset: -5,
  },
  {
    category: "Supplies & decorations",
    label: "Gym & hallway décor complete",
    team: TEAM_IDS.setup,
    dueOffset: -2,
  },
  {
    category: "Day of VBS",
    label: "Registration table & check-in tablets ready",
    team: TEAM_IDS.setup,
    dueOffset: -1,
  },
  {
    category: "Day of VBS",
    label: "Snack prep area labeled for allergens",
    team: TEAM_IDS.setup,
    dueOffset: -1,
  },
  {
    category: "Day of VBS",
    label: "Volunteer shirts distributed",
    team: TEAM_IDS.vbsWeek,
    dueOffset: 0,
  },
  {
    category: "Facilities & safety",
    label: "Daily safety briefing done each morning",
    team: TEAM_IDS.planning,
    dueOffset: 0,
  },
  {
    category: "Day of VBS",
    label: "Parent pickup tags matched to student tags",
    team: TEAM_IDS.vbsWeek,
    dueOffset: 0,
  },
];

async function applyCornerstoneMilestoneDueDates(planId: string, vbsStart: string) {
  for (const item of CORNERSTONE_MILESTONES) {
    const dueDate = addDaysToIsoDate(vbsStart, item.dueOffset);
    const category = normalizeMilestoneCategory(item.category);
    await db().query(
      `UPDATE vbs_checklist_items
       SET due_date = $3, category = $4
       WHERE plan_id = $1 AND label = $2`,
      [planId, item.label, dueDate, category],
    );
  }
}

/** Nov 10–15, 2026 · Group Rainforest Falls · Cornerstone Seattle sample plan. */
export async function ensureCornerstoneSamplePlan(orgId: string, username: string) {
  if (orgId !== ORG_ID) {
    return;
  }

  const org = await db().query("SELECT id FROM organizations WHERE id = $1", [orgId]);
  if (!org.rows[0]) {
    return;
  }

  const now = new Date().toISOString();
  const members = username;

  for (const [key, teamId] of Object.entries(TEAM_IDS)) {
    const names: Record<string, string> = {
      planning: "Planning Team",
      building: "Building Team",
      setup: "Setup Team",
      vbsWeek: "VBS Week Team",
    };
    const name = names[key];
    await db().query(
      `DELETE FROM org_teams
       WHERE organization_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2)) AND id <> $3`,
      [orgId, name, teamId],
    );
    await db().query(
      `INSERT INTO org_teams (id, organization_id, name, members, created_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, members = EXCLUDED.members`,
      [teamId, orgId, name, members, now],
    );
  }
  await dedupeOrgTeamsByName(orgId);

  const startDate = isoDate(2026, 11, 10);
  const endDate = isoDate(2026, 11, 15);
  const coordinatorNotes = `Rainforest Falls week at Cornerstone Seattle. ${SAMPLE_MARKER}`;

  const existingPlan = await db().query<{ id: string; coordinator_notes: string }>(
    "SELECT id, coordinator_notes FROM vbs_plans WHERE organization_id = $1",
    [orgId],
  );
  const planId = existingPlan.rows[0]?.id ?? PLAN_ID;

  if (!existingPlan.rows[0]) {
    await db().query(
      `INSERT INTO vbs_plans (
         id, organization_id, year, title, publisher_id, program_title, location,
         start_date, end_date, daily_start, daily_end, expected_kids, coordinator_notes, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        PLAN_ID,
        orgId,
        2026,
        "VBS 2026 · Rainforest Falls",
        "group",
        "Rainforest Falls",
        "Cornerstone Seattle campus",
        startDate,
        endDate,
        "09:00",
        "12:00",
        120,
        coordinatorNotes,
        now,
      ],
    );
  } else {
    await db().query(
      `UPDATE vbs_plans SET
         year = $2, title = $3, publisher_id = $4, program_title = $5, location = $6,
         start_date = $7, end_date = $8, daily_start = $9, daily_end = $10,
         expected_kids = $11, coordinator_notes = $12, updated_at = $13
       WHERE organization_id = $1`,
      [
        orgId,
        2026,
        "VBS 2026 · Rainforest Falls",
        "group",
        "Rainforest Falls",
        "Cornerstone Seattle campus",
        startDate,
        endDate,
        "09:00",
        "12:00",
        120,
        coordinatorNotes,
        now,
      ],
    );
  }

  const [taskCount, scheduleCount, checklistCount, boardCount] = await Promise.all([
    db().query<{ count: number }>("SELECT COUNT(*)::int AS count FROM vbs_tasks WHERE plan_id = $1", [planId]),
    db().query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM vbs_schedule_slots WHERE plan_id = $1",
      [planId],
    ),
    db().query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM vbs_checklist_items WHERE plan_id = $1",
      [planId],
    ),
    db().query<{ count: number }>("SELECT COUNT(*)::int AS count FROM vbs_board_posts WHERE plan_id = $1", [
      planId,
    ]),
  ]);
  const sampleComplete =
    coordinatorNotes.includes(SAMPLE_MARKER) &&
    (taskCount.rows[0]?.count ?? 0) >= 25 &&
    (scheduleCount.rows[0]?.count ?? 0) >= 44 &&
    (checklistCount.rows[0]?.count ?? 0) >= 12 &&
    (boardCount.rows[0]?.count ?? 0) >= 5;
  if (sampleComplete) {
    await applyCornerstoneMilestoneDueDates(planId, startDate);
    return;
  }

  await db().query(
    `DELETE FROM vbs_board_replies WHERE post_id IN (SELECT id FROM vbs_board_posts WHERE plan_id = $1)`,
    [planId],
  );
  await db().query("DELETE FROM vbs_board_posts WHERE plan_id = $1", [planId]);
  await db().query("DELETE FROM vbs_schedule_slots WHERE plan_id = $1", [planId]);
  await db().query("DELETE FROM vbs_tasks WHERE plan_id = $1", [planId]);
  await db().query("DELETE FROM vbs_checklist_items WHERE plan_id = $1", [planId]);

  const stations: { name: string; teamId: string }[] = [
    { name: "Registration & nametags", teamId: TEAM_IDS.vbsWeek },
    { name: "Rainforest opening worship", teamId: TEAM_IDS.building },
    { name: "Bible story rotation", teamId: TEAM_IDS.planning },
    { name: "Craft & science station", teamId: TEAM_IDS.building },
    { name: "Snack station", teamId: TEAM_IDS.setup },
    { name: "Games & recreation", teamId: TEAM_IDS.setup },
    { name: "Music & memory verse", teamId: TEAM_IDS.vbsWeek },
    { name: "Closing rally", teamId: TEAM_IDS.vbsWeek },
  ];
  await db().query("DELETE FROM vbs_stations WHERE plan_id = $1", [planId]);
  for (let i = 0; i < stations.length; i += 1) {
    const station = stations[i];
    await db().query(
      `INSERT INTO vbs_stations (id, plan_id, name, description, default_team_id, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [crypto.randomUUID(), planId, station.name, "", station.teamId, i],
    );
  }

  type TaskSeed = {
    title: string;
    description: string;
    category: string;
    due: string;
    teamId?: string;
    status?: string;
  };

  const tasks: TaskSeed[] = [
    {
      title: "Buy Rainforest Falls curriculum kit",
      description: "Order Group starter kit + extras; confirm shipping to church.",
      category: "curriculum",
      due: isoDate(2026, 8, 15),
      teamId: TEAM_IDS.planning,
    },
    {
      title: "Planning team meeting 1 — kickoff & dates",
      description: "Confirm Nov 10–15 schedule, budget, and volunteer targets.",
      category: "planning",
      due: isoDate(2026, 6, 8),
      teamId: TEAM_IDS.planning,
      status: "done",
    },
    {
      title: "Planning team meeting 2 — curriculum walk-through",
      description: "Preview lessons, rotation model, and supply list.",
      category: "planning",
      due: isoDate(2026, 7, 13),
      teamId: TEAM_IDS.planning,
      status: "done",
    },
    {
      title: "Planning team meeting 3 — volunteer roles & stations",
      description: "Assign leads for registration, crafts, games, and safety.",
      category: "planning",
      due: isoDate(2026, 8, 24),
      teamId: TEAM_IDS.planning,
    },
    {
      title: "Set family registration signup deadline",
      description: "Close online registration; export roster for nametags and t-shirts.",
      category: "communications",
      due: isoDate(2026, 9, 30),
      teamId: TEAM_IDS.planning,
    },
    {
      title: "Create registration nametags",
      description: "Print student & volunteer nametags from roster; sort by grade/crew.",
      category: "supplies",
      due: isoDate(2026, 10, 20),
      teamId: TEAM_IDS.vbsWeek,
    },
    {
      title: "Collect student t-shirt sizes",
      description: "After signup deadline — email families who have not submitted sizes.",
      category: "supplies",
      due: isoDate(2026, 10, 12),
      teamId: TEAM_IDS.planning,
    },
    {
      title: "Collect helper & building team t-shirt sizes",
      description: "Volunteers, setup crew, and VBS week team sizes for shirt order.",
      category: "supplies",
      due: isoDate(2026, 10, 18),
      teamId: TEAM_IDS.planning,
    },
    {
      title: "Order volunteer & building team t-shirts",
      description: "Place shirt order after sizes collected; allow 2 weeks production.",
      category: "supplies",
      due: isoDate(2026, 10, 1),
      teamId: TEAM_IDS.planning,
    },
    {
      title: "Purchase group/event tickets (if required)",
      description: "Buy any venue, bus, or activity tickets — due 2 weeks before VBS.",
      category: "planning",
      due: isoDate(2026, 10, 27),
      teamId: TEAM_IDS.planning,
    },
    {
      title: "Building team meeting 1 — décor plan & materials",
      description: "Rainforest flats, vines, soundscape; start builds in September.",
      category: "supplies",
      due: isoDate(2026, 9, 5),
      teamId: TEAM_IDS.building,
    },
    {
      title: "Building team meeting 2 — main stage & hallway",
      description: "Assign walls; review fire code and tape-down plan.",
      category: "supplies",
      due: isoDate(2026, 9, 19),
      teamId: TEAM_IDS.building,
    },
    {
      title: "Building team meeting 3 — final walk-through",
      description: "Touch-up paint, lighting, and storage labels before setup week.",
      category: "supplies",
      due: isoDate(2026, 10, 3),
      teamId: TEAM_IDS.building,
    },
    {
      title: "Setup planning meeting (2 weeks before VBS)",
      description: "Room assignments, truck schedule, and safety checklist.",
      category: "planning",
      due: isoDate(2026, 10, 27),
      teamId: TEAM_IDS.setup,
    },
    {
      title: "Setup planning meeting (1 week before VBS)",
      description: "Final crew list, keys, and day-by-day setup assignments.",
      category: "planning",
      due: isoDate(2026, 11, 3),
      teamId: TEAM_IDS.setup,
    },
    {
      title: "Setup crew — all-day build (5 days before VBS)",
      description: "Move flats in; begin rainforest install in gym & hallways.",
      category: "supplies",
      due: isoDate(2026, 11, 5),
      teamId: TEAM_IDS.setup,
    },
    {
      title: "Setup crew — all-day build (4 days before VBS)",
      description: "Stage trees, registration area, and station signage.",
      category: "supplies",
      due: isoDate(2026, 11, 6),
      teamId: TEAM_IDS.setup,
    },
    {
      title: "Setup crew — all-day build (3 days before VBS)",
      description: "Craft & snack prep rooms; test A/V for opening.",
      category: "supplies",
      due: isoDate(2026, 11, 7),
      teamId: TEAM_IDS.setup,
    },
    {
      title: "Setup crew — all-day build (2 days before VBS)",
      description: "Games & recreation zones; outdoor signage if used.",
      category: "supplies",
      due: isoDate(2026, 11, 8),
      teamId: TEAM_IDS.setup,
    },
    {
      title: "Setup crew — all-day build (1 day before VBS)",
      description: "Final décor, cleaning, volunteer walk-through, lock registration packs.",
      category: "supplies",
      due: isoDate(2026, 11, 9),
      teamId: TEAM_IDS.setup,
    },
    {
      title: "Recruit VBS week volunteers",
      description: "Fill station leads and floaters; confirm background checks.",
      category: "volunteers",
      due: isoDate(2026, 10, 5),
      teamId: TEAM_IDS.vbsWeek,
    },
    {
      title: "Order snacks & allergy-safe alternatives",
      description: "Two-week snack plan; label allergens for registration desk.",
      category: "supplies",
      due: isoDate(2026, 10, 22),
      teamId: TEAM_IDS.planning,
    },
    {
      title: "Publish volunteer schedule to teams",
      description: "Email VBS week team rotations; post in team messages.",
      category: "communications",
      due: isoDate(2026, 11, 1),
      teamId: TEAM_IDS.vbsWeek,
    },
    {
      title: "Safety walk & first-aid kit stocked",
      description: "Trip hazards, epi pens list, emergency contacts at registration.",
      category: "safety",
      due: isoDate(2026, 11, 8),
      teamId: TEAM_IDS.planning,
    },
    {
      title: "VBS week team huddle — Day 1 prep",
      description: "8:45 a.m. Nov 10: nametags, radios, and prayer before doors open.",
      category: "volunteers",
      due: isoDate(2026, 11, 10),
      teamId: TEAM_IDS.vbsWeek,
    },
  ];

  for (let i = 0; i < tasks.length; i += 1) {
    const task = tasks[i];
    await db().query(
      `INSERT INTO vbs_tasks (
         id, plan_id, title, description, category, status, due_date,
         assigned_username, assigned_team_id, sort_order, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9,$10)`,
      [
        crypto.randomUUID(),
        planId,
        task.title,
        task.description,
        task.category,
        task.status ?? "todo",
        task.due,
        task.teamId ?? null,
        i,
        now,
      ],
    );
  }

  const dayBlocks = [
    ["09:00", "09:20", "Registration & opening worship"],
    ["09:25", "09:55", "Bible story rotation"],
    ["10:00", "10:25", "Craft & science station"],
    ["10:30", "10:55", "Snack & games"],
    ["11:00", "11:25", "Music & memory verse"],
    ["11:30", "12:00", "Closing rally & pickup"],
  ];

  for (let day = 0; day < 6; day += 1) {
    const dayIso = isoDate(2026, 11, 10 + day);
    for (let i = 0; i < dayBlocks.length; i += 1) {
      const [starts, ends, label] = dayBlocks[i];
      let teamId: (typeof TEAM_IDS)[keyof typeof TEAM_IDS] = TEAM_IDS.vbsWeek;
      if (label.includes("Craft")) {
        teamId = TEAM_IDS.building;
      } else if (label.includes("Snack") || label.includes("Games")) {
        teamId = TEAM_IDS.setup;
      }
      await db().query(
        `INSERT INTO vbs_schedule_slots (
           id, plan_id, day_date, starts_at, ends_at, label, station_id, team_id, notes
         ) VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,$8)`,
        [
          crypto.randomUUID(),
          planId,
          dayIso,
          starts,
          ends,
          label,
          teamId,
          day === 5 ? "Saturday family celebration day" : "",
        ],
      );
    }
  }

  const buildingMeetings = [
    { day: isoDate(2026, 9, 5), label: "Building team — décor plan & materials" },
    { day: isoDate(2026, 9, 19), label: "Building team — main stage & hallway" },
    { day: isoDate(2026, 10, 3), label: "Building team — final walk-through" },
  ];
  for (const meeting of buildingMeetings) {
    await db().query(
      `INSERT INTO vbs_schedule_slots (
         id, plan_id, day_date, starts_at, ends_at, label, station_id, team_id, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,$8)`,
      [
        crypto.randomUUID(),
        planId,
        meeting.day,
        "18:30",
        "20:00",
        meeting.label,
        TEAM_IDS.building,
        "Building Team meeting",
      ],
    );
  }

  for (let day = 5; day >= 1; day -= 1) {
    const dayIso = isoDate(2026, 11, 9 + day - 5);
    await db().query(
      `INSERT INTO vbs_schedule_slots (
         id, plan_id, day_date, starts_at, ends_at, label, station_id, team_id, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,$8)`,
      [
        crypto.randomUUID(),
        planId,
        dayIso,
        "08:00",
        "16:00",
        `Setup Team — all-day build (${day} day${day === 1 ? "" : "s"} before VBS)`,
        TEAM_IDS.setup,
        "Setup Team",
      ],
    );
  }

  for (let i = 0; i < CORNERSTONE_MILESTONES.length; i += 1) {
    const item = CORNERSTONE_MILESTONES[i];
    await db().query(
      `INSERT INTO vbs_checklist_items (id, plan_id, category, label, done, assigned_team_id, due_date, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        crypto.randomUUID(),
        planId,
        normalizeMilestoneCategory(item.category),
        item.label,
        item.done ?? false,
        item.team,
        addDaysToIsoDate(startDate, item.dueOffset),
        i,
      ],
    );
  }

  type BoardSeed = {
    id: string;
    title: string;
    body: string;
    teamId: string | null;
    createdAt: string;
    replies: { body: string; createdAt: string; author: string }[];
  };

  const boardPosts: BoardSeed[] = [
    {
      id: BOARD_POST_IDS.orgWelcome,
      title: "Rainforest Falls — Nov 10–15 schedule is live",
      body: `Coordinators posted the daily rotation and registration flow in the plan. Review the Schedule tab before setup week. ${BOARD_MARKER}`,
      teamId: null,
      createdAt: isoDate(2026, 10, 1) + "T15:00:00.000Z",
      replies: [
        {
          author: username,
          body: "Thanks — I'll share this with station leads at our next huddle.",
          createdAt: isoDate(2026, 10, 2) + "T16:20:00.000Z",
        },
      ],
    },
    {
      id: BOARD_POST_IDS.volunteerRoles,
      title: "Volunteer role signup — one slot left at crafts",
      body: `We still need one floater for craft & science on Wed–Thu. Reply here if you can cover. ${BOARD_MARKER}`,
      teamId: TEAM_IDS.vbsWeek,
      createdAt: isoDate(2026, 10, 15) + "T18:00:00.000Z",
      replies: [
        {
          author: username,
          body: "I can take Wed morning if we swap my games slot to afternoon.",
          createdAt: isoDate(2026, 10, 16) + "T09:10:00.000Z",
        },
        {
          author: username,
          body: "Confirmed — updated the task list and schedule. Thank you!",
          createdAt: isoDate(2026, 10, 16) + "T11:45:00.000Z",
        },
      ],
    },
    {
      id: BOARD_POST_IDS.building,
      title: "Building Team — flats inventory & paint colors",
      body: `Rainforest palette posted in the Building Team folder. Confirm quantities before ordering touch-up paint. ${BOARD_MARKER}`,
      teamId: TEAM_IDS.building,
      createdAt: isoDate(2026, 9, 2) + "T17:00:00.000Z",
      replies: [
        {
          author: username,
          body: "Counted 12 flats in storage — list matches the checklist item.",
          createdAt: isoDate(2026, 9, 3) + "T10:15:00.000Z",
        },
      ],
    },
    {
      id: BOARD_POST_IDS.setupCrew,
      title: "Setup Team — truck arrives Monday 7 a.m.",
      body: `Please meet at the east loading dock. Bring work gloves; flats are labeled by room. ${BOARD_MARKER}`,
      teamId: TEAM_IDS.setup,
      createdAt: isoDate(2026, 11, 4) + "T20:00:00.000Z",
      replies: [],
    },
    {
      id: BOARD_POST_IDS.vbsWeek,
      title: "Day 1 reminder: radios & check-in tablets charged",
      body: `Registration opens 8:30; first kids at 9:00. Safety walk notes are on the checklist. ${BOARD_MARKER}`,
      teamId: TEAM_IDS.vbsWeek,
      createdAt: isoDate(2026, 11, 9) + "T21:30:00.000Z",
      replies: [
        {
          author: username,
          body: "Tablets are on the charger cart — see you at 8:15 for huddle.",
          createdAt: isoDate(2026, 11, 9) + "T22:05:00.000Z",
        },
      ],
    },
  ];

  for (const post of boardPosts) {
    await db().query(
      `INSERT INTO vbs_board_posts (id, plan_id, title, body, created_by, created_at, team_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [post.id, planId, post.title, post.body, username, post.createdAt, post.teamId],
    );
    for (const reply of post.replies) {
      await db().query(
        `INSERT INTO vbs_board_replies (id, post_id, body, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [crypto.randomUUID(), post.id, reply.body, reply.author, reply.createdAt],
      );
    }
  }
}
