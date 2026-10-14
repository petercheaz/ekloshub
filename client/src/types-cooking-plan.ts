import type { Publisher, ShareProgram } from "./types";
import type { CookingPlanDocument } from "@vbs-cooking-plan-types";

export type {
  CookingPlanDocument,
  SnackMenuItem,
  SnackMenuItemKind,
} from "@vbs-cooking-plan-types";

export type CookingPlanWorkspace = {
  organizationName: string;
  cookingTeamId: string;
  teams: { id: string; name: string }[];
  canConfigureCooking: boolean;
  extraInstructions: string;
  plan: CookingPlanDocument;
  planUpdatedAt: string;
  studentCount: number;
  allergySummary: string;
  allergyByAllergen: { label: string; count: number }[];
  allergyStudents: { childFullName: string; allergiesLabel: string; classId: string }[];
  commonAllergies: string[];
  defaultYear: number;
  publishers: Publisher[];
  programs: ShareProgram[];
};
