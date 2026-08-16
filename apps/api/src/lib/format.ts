export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** exponent);
  const display = value >= 10 || exponent === 0 ? Math.round(value) : Number(value.toFixed(1));
  return `${display} ${units[exponent]}`;
}

export function normalizeName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function safeFileName(name: string) {
  const normalized = name.normalize("NFKC").trim();
  if (!normalized || normalized === "." || normalized === ".." || normalized.includes("/") || normalized.includes("\\") || /[\u0000-\u001F]/.test(normalized)) {
    return null;
  }
  return normalized.slice(0, 255);
}
