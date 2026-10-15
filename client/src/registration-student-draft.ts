import type { VbsRegistrationPaymentStatus, VbsRegistrationStudent } from "./types";

export type RegistrationStudentDraft = {
  id: string;
  childFullName: string;
  childGender: "M" | "F" | "";
  birthMonth: number;
  birthYear: number;
  allergiesCommon: string[];
  allergiesOther: string;
  comments: string;
  specialRequests: string;
  contact1Name: string;
  contact1Phone: string;
  contact1Email: string;
  contact2Name: string;
  contact2Phone: string;
  contact2Email: string;
  attendMon: boolean;
  attendTue: boolean;
  attendWed: boolean;
  attendThu: boolean;
  attendFri: boolean;
  tshirtSize: string;
  assignedTeamId: string;
  classId: string;
  paymentStatus: VbsRegistrationPaymentStatus;
  nametagExtraInstructions: string;
};

export function emptyRegistrationStudentDraft(): RegistrationStudentDraft {
  const now = new Date();
  return {
    id: "",
    childFullName: "",
    childGender: "",
    birthMonth: now.getMonth() + 1,
    birthYear: now.getFullYear() - 6,
    allergiesCommon: [],
    allergiesOther: "",
    comments: "",
    specialRequests: "",
    contact1Name: "",
    contact1Phone: "",
    contact1Email: "",
    contact2Name: "",
    contact2Phone: "",
    contact2Email: "",
    attendMon: true,
    attendTue: true,
    attendWed: true,
    attendThu: true,
    attendFri: true,
    tshirtSize: "",
    assignedTeamId: "",
    classId: "",
    paymentStatus: "pending",
    nametagExtraInstructions: "",
  };
}

export function registrationStudentDraftFromStudent(student: VbsRegistrationStudent): RegistrationStudentDraft {
  return {
    id: student.id,
    childFullName: student.childFullName,
    childGender: student.childGender === "M" || student.childGender === "F" ? student.childGender : "",
    birthMonth: student.birthMonth,
    birthYear: student.birthYear,
    allergiesCommon: [...student.allergiesCommon],
    allergiesOther: student.allergiesOther,
    comments: student.comments,
    specialRequests: student.specialRequests,
    contact1Name: student.contact1Name,
    contact1Phone: student.contact1Phone,
    contact1Email: student.contact1Email,
    contact2Name: student.contact2Name,
    contact2Phone: student.contact2Phone,
    contact2Email: student.contact2Email,
    attendMon: student.attendMon,
    attendTue: student.attendTue,
    attendWed: student.attendWed,
    attendThu: student.attendThu,
    attendFri: student.attendFri,
    tshirtSize: student.tshirtSize,
    assignedTeamId: student.assignedTeamId,
    classId: student.classId,
    paymentStatus: student.paymentStatus,
    nametagExtraInstructions: student.nametagExtraInstructions,
  };
}

export function toggleRegistrationAllergy(
  draft: RegistrationStudentDraft,
  label: string,
): RegistrationStudentDraft {
  const set = new Set(draft.allergiesCommon);
  if (set.has(label)) {
    set.delete(label);
  } else {
    set.add(label);
  }
  return { ...draft, allergiesCommon: [...set] };
}
