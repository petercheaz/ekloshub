const FIRST = [
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
];

const LAST = [
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
];

const SHIRTS = ["Youth XS", "Youth S", "Youth M", "Youth L", "Youth XL"];

function pick<T>(items: T[], random: () => number) {
  return items[Math.floor(random() * items.length)]!;
}

function registrationStudentPayload(input: {
  childFullName: string;
  childGender: "M" | "F";
  ageYears: number;
  gradeLabel: string;
  tshirtSize: string;
  paymentStatus?: "paid" | "pending" | "waived";
}) {
  const year = new Date().getFullYear();
  const slug = input.childFullName.toLowerCase().replace(/\s+/g, ".");
  return {
    childFullName: input.childFullName,
    childGender: input.childGender,
    birthMonth: 6,
    birthYear: year - input.ageYears,
    contact1Name: `${input.childFullName.split(" ").slice(-1)[0] ?? "Parent"} Family`,
    contact1Phone: "2065550199",
    contact1Email: `demo.${slug}@example.com`,
    attendMon: true,
    attendTue: true,
    attendWed: true,
    attendThu: true,
    attendFri: true,
    tshirtSize: input.tshirtSize,
    specialRequests: input.gradeLabel,
    paymentStatus: input.paymentStatus ?? "pending",
    keepUnassigned: true,
  };
}

/** Five demo registrants — one per elementary grade band (K through grade 4). */
export function sampleStudentsMixedGrades() {
  return [
    registrationStudentPayload({
      childFullName: "Emma Nguyen",
      childGender: "F",
      ageYears: 5,
      gradeLabel: "Kindergarten",
      tshirtSize: "Youth XS",
      paymentStatus: "paid",
    }),
    registrationStudentPayload({
      childFullName: "Liam Patel",
      childGender: "M",
      ageYears: 6,
      gradeLabel: "Grade 1",
      tshirtSize: "Youth S",
    }),
    registrationStudentPayload({
      childFullName: "Olivia Kim",
      childGender: "F",
      ageYears: 7,
      gradeLabel: "Grade 2",
      tshirtSize: "Youth S",
      paymentStatus: "paid",
    }),
    registrationStudentPayload({
      childFullName: "Noah Garcia",
      childGender: "M",
      ageYears: 8,
      gradeLabel: "Grade 3",
      tshirtSize: "Youth M",
    }),
    registrationStudentPayload({
      childFullName: "Ava Chen",
      childGender: "F",
      ageYears: 9,
      gradeLabel: "Grade 4",
      tshirtSize: "Youth M",
      paymentStatus: "waived",
    }),
  ];
}

export function randomRegistrationStudentPayload(random: () => number = Math.random) {
  const year = new Date().getFullYear();
  const age = 4 + Math.floor(random() * 8);
  return registrationStudentPayload({
    childFullName: `${pick(FIRST, random)} ${pick(LAST, random)}`,
    childGender: random() > 0.5 ? "M" : "F",
    ageYears: age,
    gradeLabel: "",
    tshirtSize: pick(SHIRTS, random),
    paymentStatus: random() > 0.7 ? "paid" : "pending",
  });
}
