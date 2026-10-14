import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import { setApiTenant, api } from "./api";
import { useAuth } from "./auth";
import type { Organization, OrgRole } from "./types";

type OrgContextValue = {
  organizations: Organization[];
  tenantId: string | null;
  current: Organization | null;
  canWrite: boolean;
  canAdmin: boolean;
  canManageMembers: boolean;
  canManageRegistration: boolean;
  canContact: boolean;
  refreshOrgs: () => Promise<void>;
};

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const parts = location.pathname.split("/");
  const rawId = parts[1] === "org" ? parts[2] ?? null : null;
  const tenantId = rawId && rawId !== "new" ? rawId : null;
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  const refreshOrgs = useCallback(async () => {
    if (!user) {
      setOrganizations([]);
      return;
    }
    const data = await api.organizations();
    setOrganizations(data.organizations);
  }, [user]);

  setApiTenant(tenantId);
  useEffect(() => {
    return () => setApiTenant(null);
  }, []);

  useEffect(() => {
    void refreshOrgs().catch(() => setOrganizations([]));
  }, [refreshOrgs]);

  const current = organizations.find((org) => org.id === tenantId) ?? null;
  const role: OrgRole | null = current?.role ?? null;
  const platformAdmin = user?.platformAdmin === true;
  const canWrite = !tenantId || role === "org_admin" || role === "org_write";
  const canAdmin = role === "org_admin" || platformAdmin;
  const canManageMembers = role === "org_admin" || role === "registration_admin" || platformAdmin;
  const canManageRegistration = canManageMembers;
  const canContact = role === "org_admin" || role === "org_team_admin";

  const value = useMemo(
    () => ({
      organizations,
      tenantId,
      current,
      canWrite,
      canAdmin,
      canManageMembers,
      canManageRegistration,
      canContact,
      refreshOrgs,
    }),
    [
      organizations,
      tenantId,
      current,
      canWrite,
      canAdmin,
      canManageMembers,
      canManageRegistration,
      canContact,
      refreshOrgs,
    ],
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrgs() {
  const context = useContext(OrgContext);
  if (!context) {
    throw new Error("useOrgs must be used within OrgProvider");
  }
  return context;
}

export function orgPath(tenantId: string | null, path: string) {
  return tenantId ? `/org/${tenantId}${path}` : path;
}

export function OrgBanner() {
  const { current } = useOrgs();
  if (!current) {
    return null;
  }
  return <p className="org-banner">{current.name}</p>;
}
