import bcrypt from "bcryptjs";

/** VBS program year for default passwords: next year from September onward. */
export function vbsProgramYear(from: Date = new Date()) {
  const year = from.getFullYear();
  return from.getMonth() >= 8 ? year + 1 : year;
}

export function defaultVbsPassword(from: Date = new Date()) {
  return `vbs${vbsProgramYear(from)}`;
}

export function hashVbsDefaultPassword(from: Date = new Date()) {
  return bcrypt.hashSync(defaultVbsPassword(from), 10);
}

export function hashUserPassword(plain: string) {
  return bcrypt.hashSync(plain, 10);
}
