/** Match server default VBS login password (vbs + program year). */
export function vbsProgramYear(from: Date = new Date()) {
  const year = from.getFullYear();
  return from.getMonth() >= 8 ? year + 1 : year;
}

export function defaultVbsPassword(from: Date = new Date()) {
  return `vbs${vbsProgramYear(from)}`;
}
