function lastSeparatorIndex(value: string) {
  return Math.max(value.lastIndexOf(","), value.lastIndexOf(";"));
}

export function currentListToken(value: string) {
  const index = lastSeparatorIndex(value);
  return (index === -1 ? value : value.slice(index + 1)).trim();
}

export function splitListTokens(value: string) {
  return [...new Set(value.split(/[,;]+/).map((item) => item.trim()).filter(Boolean))];
}

export function completeListToken(value: string, replacement: string) {
  const index = lastSeparatorIndex(value);
  const prefix = index === -1 ? "" : `${value.slice(0, index + 1).trimEnd()} `;
  const separator = index !== -1 && value[index] === "," ? ", " : "; ";
  return `${prefix}${replacement}${separator}`;
}
