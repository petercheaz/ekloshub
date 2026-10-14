export function appPublicBase() {
  return (process.env.APP_PUBLIC_URL ?? "http://localhost:5173").replace(/\/$/, "");
}

/** Absolute URL for email/SMS; in-app notifications keep relative paths. */
export function absoluteAppLink(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${appPublicBase()}${normalized}`;
}

export function vbsPlanTabLink(orgId: string, tab?: string) {
  const base = `/org/${orgId}/vbs-plan`;
  if (!tab || tab === "overview") {
    return base;
  }
  return `${base}?tab=${encodeURIComponent(tab)}`;
}
