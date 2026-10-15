/**
 * Station names used for registration classes and VBS plan rotations.
 * Keep registration class names aligned with schedule / station labels.
 */
export const VBS_ROTATION_STATION_NAMES = [
  "Bible Story Rotation",
  "Craft & Science Station",
  "Music & Memory Verse",
  "Games & Recreation",
  "Snack Station",
] as const;

export type VbsRotationStationName = (typeof VBS_ROTATION_STATION_NAMES)[number];

export const DEFAULT_REGISTRATION_CLASS_DEFAULTS = {
  minAge: 4,
  maxAge: 11,
  capacityMax: 24,
} as const;

/** Stations on the VBS plan (rotations plus bookends). */
export function defaultVbsPlanStationNames(): string[] {
  return [
    "Registration & Opening Worship",
    ...VBS_ROTATION_STATION_NAMES,
    "Closing Rally & Pickup",
  ];
}

/** Normalize for matching legacy or hand-edited labels. */
export function rotationNameKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\band\b/g, "&")
    .replace(/schence/g, "science")
    .replace(/\s+/g, " ")
    .replace(/\s*&\s*/g, " & ");
}

export function rotationNameMatches(stored: string, canonical: string): boolean {
  const a = rotationNameKey(stored);
  const b = rotationNameKey(canonical);
  if (a === b) {
    return true;
  }
  if (a.includes(b) || b.includes(a)) {
    return true;
  }
  const bucket = rotationBucket(stored);
  const canonBucket = rotationBucket(canonical);
  return bucket !== null && bucket === canonBucket;
}

/** Display title for a registration class tied to a rotation station. */
export function formatRegistrationClassName(rotationIndex: number, sectionLabel = "") {
  const base = VBS_ROTATION_STATION_NAMES[rotationIndex];
  if (!base) {
    return sectionLabel.trim() || "Class";
  }
  const suffix = sectionLabel.trim();
  return suffix ? `${base} ${suffix}` : base;
}

/** Section suffix when the stored name is longer than the station title (e.g. "II"). */
export function inferSectionLabelFromClassName(className: string, rotationIndex: number) {
  const base = VBS_ROTATION_STATION_NAMES[rotationIndex];
  if (!base) {
    return "";
  }
  const trimmed = className.trim();
  if (trimmed.length <= base.length) {
    return "";
  }
  if (rotationNameMatches(trimmed, base) && trimmed !== base) {
    return trimmed.slice(base.length).trim();
  }
  return "";
}

export function rotationBucket(name: string): number | null {
  let key = rotationNameKey(name);
  key = key.replace(/\s+(?:i{1,3}|iv|vi{0,3}|ix|x{1,3}|\d+|[a-z])$/i, "").trim();
  if (key.includes("bible") && key.includes("stor")) {
    return 0;
  }
  if (key.includes("craft") || (key.includes("science") && !key.includes("bible"))) {
    return 1;
  }
  if (key.includes("music") || key.includes("memory") || key.includes("verse")) {
    return 2;
  }
  if (key.includes("game") || key.includes("recreation") || key.includes("rec ")) {
    return 3;
  }
  if (key.includes("snack")) {
    return 4;
  }
  for (let i = 0; i < VBS_ROTATION_STATION_NAMES.length; i += 1) {
    if (rotationNameKey(VBS_ROTATION_STATION_NAMES[i]) === key) {
      return i;
    }
  }
  return null;
}
