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
  return "download";
}

export function errorMessage(error, fallback = "Something went wrong. Please try again.") {
  return error instanceof Error && error.message ? error.message : fallback;
}
