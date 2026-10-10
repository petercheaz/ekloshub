/** Postgres DATE / TIMESTAMPTZ values as stable YYYY-MM-DD (UTC calendar day). */
export function formatPgDate(value: Date | string | null | undefined): string {
  if (value == null || value === "") {
    return "";
  }
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}
