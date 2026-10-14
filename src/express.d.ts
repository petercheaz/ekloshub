import type { OrgRole } from "./org-permissions.js";

declare global {
  namespace Express {
    interface Request {
      tenantId: string | null;
      tenantRole: OrgRole | null;
      platformAdmin: boolean;
    }
  }
}

export {};
