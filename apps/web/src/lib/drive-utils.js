export function normalizePath(path = "") {
  return path.replace(/^\/+|\/+$/g, "");
}

export function joinPath(...segments) {
  return segments.map(normalizePath).filter(Boolean).join("/");
}

export function pathSegments(path = "") {
  const normalized = normalizePath(path);
  return normalized ? normalized.split("/") : [];
}

export function fileExtension(name = "") {
  const extension = name.split(".").pop();
  return extension === name ? "" : extension.toLowerCase();
}

export function previewKind(name) {
  const extension = fileExtension(name);
  if (["png", "jpg", "jpeg", "gif", "webp", "avif"].includes(extension)) return "image";
  if (["mp4", "webm", "mov"].includes(extension)) return "video";
  if (["mp3", "wav", "ogg", "m4a"].includes(extension)) return "audio";
  if (["pdf", "txt", "json"].includes(extension)) return "embed";
  if (["js", "jsx", "ts", "tsx", "mjs", "cjs", "lua", "py", "rb", "php", "java", "c", "cc", "cpp", "cs", "go", "rs", "swift", "kt", "kts", "sh", "bash", "zsh", "fish", "html", "css", "scss", "sass", "less", "vue", "svelte", "xml", "yaml", "yml", "toml", "sql", "md", "mdx", "graphql", "gql", "dockerfile"].includes(extension) || name.toLowerCase() === "dockerfile") return "code";
  return "download";
}

export function trashDaysRemaining(trashedAt, retentionDays = 30, now = Date.now()) {
  const deletedAt = new Date(trashedAt).getTime();
  if (!Number.isFinite(deletedAt) || !Number.isFinite(now)) return null;
  const millisecondsRemaining = deletedAt + retentionDays * 24 * 60 * 60 * 1_000 - now;
  return Math.max(0, Math.ceil(millisecondsRemaining / (24 * 60 * 60 * 1_000)));
}

export function errorMessage(error, fallback = "Something went wrong. Please try again.") {
  return error instanceof Error && error.message ? error.message : fallback;
}
