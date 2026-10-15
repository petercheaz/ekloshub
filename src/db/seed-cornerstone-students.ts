import { COMMON_REGISTRATION_ALLERGIES } from "../vbs-registration.js";
import { db } from "./pool.js";

export const CORNERSTONE_ORG_ID_FOR_STUDENTS = "org-cornerstone-seattle";
export const CORNERSTONE_REGISTRATION_DEMO_MARKER = "cornerstone-reg-demo-v4";
const DEMO_STUDENT_COUNT = 55;
const VBS_SEASON = 2026;
type DemoStudentSeed = {
  id: string;
  childFullName: string;
  childGender: "M" | "F";
  birthMonth: number;
  birthYear: number;
  allergiesCommon: string[];
  allergiesOther: string;
  tshirtSize: string;
  paymentStatus: "paid" | "pending" | "waived";
  attendMon: boolean;
  attendTue: boolean;
  attendWed: boolean;
  attendThu: boolean;
  attendFri: boolean;
  contact1Name: string;
  contact1Phone: string;
  contact1Email: string;
};

const FIRST_NAMES = [
  "Emma",
  "Liam",
  "Olivia",
  "Noah",
  "Ava",
  "Ethan",
  "Sophia",
  "Mason",
  "Isabella",
  "Lucas",
  "Mia",
  "Oliver",
  "Charlotte",
  "Elijah",
  "Amelia",
  "James",
  "Harper",
  "Benjamin",
  "Evelyn",
  "Henry",
  "Scarlett",
  "Alexander",
  "Grace",
  "Daniel",
  "Chloe",
  "Matthew",
  "Zoey",
  "Jackson",
  "Lily",
  "Sebastian",
  "Aria",
  "Jack",
  "Riley",
  "Owen",
  "Layla",
  "Samuel",
  "Nora",
  "Levi",
  "Hazel",
  "Mateo",
];

const LAST_NAMES = [
  "Nguyen",
  "Patel",
  "Kim",
  "Garcia",
  "Chen",
  "Walsh",
  "Brooks",
  "Santos",
  "Reed",
  "Hayes",
  "Murphy",
  "Price",
  "Howard",
  "Ramirez",
  "Cooper",
  "Bailey",
  "Rivera",
  "Coleman",
  "Turner",
  "Parker",
  "Collins",
  "Edwards",
  "Stewart",
  "Morris",
  "Rogers",
  "Cook",
  "Morgan",
  "Bell",
  "Ward",
  "Torres",
];

const CORNERSTONE_DEMO_CLASSES = [
  {
    id: "reg-cls-cornerstone-pre-a",
    name: "Preschool Crew A",
    minAge: 3,
    maxAge: 5,
    sortOrder: 0,
  },
  {
    id: "reg-cls-cornerstone-pre-b",
    name: "Preschool Crew B",
    minAge: 3,
    maxAge: 5,
    sortOrder: 1,
  },
  {
    id: "reg-cls-cornerstone-pre-c",
    name: "Preschool Crew C",
    minAge: 3,
    maxAge: 5,
    sortOrder: 2,
  },
  {
    id: "reg-cls-cornerstone-elem-a",
    name: "Elementary Crew A",
    minAge: 6,
    maxAge: 8,
    sortOrder: 3,
  },
  {
    id: "reg-cls-cornerstone-elem-b",
    name: "Elementary Crew B",
    minAge: 6,
    maxAge: 8,
    sortOrder: 4,
  },
  {
    id: "reg-cls-cornerstone-elem-c",
    name: "Elementary Crew C",
    minAge: 9,
    maxAge: 11,
    sortOrder: 5,
  },
] as const;

function shirtForAge(age: number) {
  if (age <= 4) {
    return "Youth XS";
  }
  if (age <= 6) {
    return "Youth S";
  }
  if (age <= 8) {
    return "Youth M";
  }
  return "Youth L";
}

function pickAllergies(index: number): { common: string[]; other: string } {
  if (index % 4 !== 0 && index % 5 !== 0) {
    return { common: [], other: "" };
  }
  const pool = [...COMMON_REGISTRATION_ALLERGIES];
  const a = pool[index % pool.length]!;
  const b = index % 8 === 0 ? pool[(index + 3) % pool.length]! : null;
  const common = b && b !== a ? [a, b] : [a];
  const other = index % 11 === 0 ? "Seasonal pollen; pack antihistamine" : "";
  return { common, other };
}

export function buildCornerstoneDemoStudentSeeds(): DemoStudentSeed[] {
  const seeds: DemoStudentSeed[] = [];
  for (let i = 0; i < DEMO_STUDENT_COUNT; i += 1) {
    const preschool = i < 22;
    const age = preschool ? 3 + (i % 3) : 6 + (i % 6);
    const birthYear = VBS_SEASON - age;
    const birthMonth = ((i * 5) % 12) + 1;
    const first = FIRST_NAMES[i % FIRST_NAMES.length]!;
    const last = LAST_NAMES[(i * 7) % LAST_NAMES.length]!;
    const { common, other } = pickAllergies(i);
    const paymentStatus: DemoStudentSeed["paymentStatus"] =
      i % 9 === 0 ? "waived" : i % 3 === 0 ? "pending" : "paid";
    seeds.push({
      id: `reg-cornerstone-demo-${String(i + 1).padStart(3, "0")}`,
      childFullName: `${first} ${last}`,
      childGender: i % 2 === 0 ? "F" : "M",
      birthMonth,
      birthYear,
      allergiesCommon: common,
      allergiesOther: other,
      tshirtSize: shirtForAge(age),
      paymentStatus,
      attendMon: true,
      attendTue: true,
      attendWed: true,
      attendThu: i % 13 !== 0,
      attendFri: i % 17 !== 0,
      contact1Name: `${last} Family`,
      contact1Phone: `206555${String(1000 + i).slice(-4)}`,
      contact1Email: `demo.parent.${i + 1}@example.com`,
    });
  }
  return seeds;
}

async function ensureCornerstoneDemoClasses(orgId: string) {
  for (const cls of CORNERSTONE_DEMO_CLASSES) {
    await db().query(
      `INSERT INTO vbs_registration_classes (
         id, organization_id, name, rotation_index, section_label, min_age, max_age,
         capacity_max, registration_closed, sort_order, vbs_season_year, created_at, updated_at
       ) VALUES ($1,$2,$3,NULL,'',$4,$5,24,FALSE,$6,$7,NOW(),NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         min_age = EXCLUDED.min_age,
         max_age = EXCLUDED.max_age,
         sort_order = EXCLUDED.sort_order,
         vbs_season_year = EXCLUDED.vbs_season_year,
         updated_at = NOW()`,
      [cls.id, orgId, cls.name, cls.minAge, cls.maxAge, cls.sortOrder, VBS_SEASON],
    );
  }
}

/** Replace Cornerstone demo registrants — fictional children only, not workbook volunteers. */
export async function ensureCornerstoneDemoStudents(orgId: string) {
  if (orgId !== CORNERSTONE_ORG_ID_FOR_STUDENTS) {
    return;
  }

  const markerRow = await db().query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM vbs_registrations
     WHERE organization_id = $1 AND vbs_season_year = $2 AND comments = $3`,
    [orgId, VBS_SEASON, CORNERSTONE_REGISTRATION_DEMO_MARKER],
  );
  if ((markerRow.rows[0]?.count ?? 0) >= DEMO_STUDENT_COUNT) {
    return;
  }

  await db().query(
    `DELETE FROM vbs_registrations
     WHERE organization_id = $1 AND vbs_season_year = $2 AND comments LIKE 'cornerstone-reg-demo-%'`,
    [orgId, VBS_SEASON],
  );

  await ensureCornerstoneDemoClasses(orgId);
  const seeds = buildCornerstoneDemoStudentSeeds();

  for (const student of seeds) {
    await db().query(
      `INSERT INTO vbs_registrations (
        id, organization_id, child_full_name, child_gender, birth_month, birth_year,
        allergies_common, allergies_other, comments, special_requests,
        contact1_name, contact1_phone, contact1_email, contact2_name, contact2_phone, contact2_email,
        attend_mon, attend_tue, attend_wed, attend_thu, attend_fri, tshirt_size,
        payment_status, source, vbs_season_year, class_id, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,'',
        $10,$11,$12,'','','',
        $13,$14,$15,$16,$17,$18,$19,'staff',$20,$21,NOW(),NOW()
      )`,
      [
        student.id,
        orgId,
        student.childFullName,
        student.childGender,
        student.birthMonth,
        student.birthYear,
        student.allergiesCommon,
        student.allergiesOther,
        CORNERSTONE_REGISTRATION_DEMO_MARKER,
        student.contact1Name,
        student.contact1Phone,
        student.contact1Email,
        student.attendMon,
        student.attendTue,
        student.attendWed,
        student.attendThu,
        student.attendFri,
        student.tshirtSize,
        student.paymentStatus,
        VBS_SEASON,
        null,
      ],
    );
  }
}
