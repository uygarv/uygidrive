import { mockDriveList, mockSession } from "@/lib/mock-drive";

const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"
).replace(/\/$/, "");

function isMockDrive() {
  if (process.env.NEXT_PUBLIC_MOCK_DRIVE === "true") return true;

  return (
    typeof window !== "undefined" &&
    process.env.NODE_ENV === "development" &&
    new URLSearchParams(window.location.search).get("mock") === "1"
  );
}

let csrfToken = null;
let csrfPromise = null;

function endpoint(path) {
  return `${apiBaseUrl}${path}`;
}

function apiError(payload, fallback) {
  const error = new Error(payload?.error?.message || fallback);
  error.code = payload?.error?.code;
  error.details = payload?.error?.details;
  return error;
}

async function responseBody(response) {
  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return {
      error: {
        message: text,
      },
    };
  }
}

async function ensureCsrf() {
  // We already have a token.
  if (csrfToken) {
    return csrfToken;
  }

  // Another request is currently fetching one.
  // Reuse that request instead of starting another /csrf call.
  if (csrfPromise) {
    return csrfPromise;
  }

  csrfPromise = (async () => {
    try {
      const response = await fetch(endpoint("/v1/auth/csrf"), {
        credentials: "include",
      });

      const body = await responseBody(response);

      if (!response.ok || !body?.token) {
        throw apiError(
          body,
          "Unable to prepare a secure request.",
        );
      }

      csrfToken = body.token;

      return csrfToken;
    } finally {
      // The request is no longer in flight.
      //
      // csrfToken remains cached if successful.
      csrfPromise = null;
    }
  })();

  return csrfPromise;
}

async function request(path, options = {}) {
  const method = options.method || "GET";

  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(
    method.toUpperCase(),
  );

  const csrf = unsafe
    ? await ensureCsrf()
    : null;

  const response = await fetch(endpoint(path), {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) && !(options.body instanceof Blob)
        ? {
            "Content-Type": "application/json",
          }
        : {}),
      ...(csrf
        ? {
            "X-CSRF-Token": csrf,
          }
        : {}),
      ...options.headers,
    },
  });

  const body = await responseBody(response);

  if (!response.ok) {
    throw apiError(
      body,
      `Request failed (${response.status})`,
    );
  }

  return body;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];

  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );

  const value = bytes / 1024 ** exponent;

  return `${
    value >= 10 || exponent === 0
      ? Math.round(value)
      : value.toFixed(1)
  } ${units[exponent]}`;
}

function normalizeFile(file) {
  return {
    id: file.id,
    name: file.name,
    type: file.kind === "folder" ? "folder" : "file",
    parentId: file.parentId || null,
    size:
      file.kind === "folder"
        ? "Folder"
        : formatBytes(Number(file.sizeBytes || 0)),
    rawSize: Number(file.sizeBytes || 0),
    createdAt: file.createdAt || null,
    contentType: file.contentType || null,
    previewUrl: file.previewUrl || null,
    trashedAt: file.trashedAt || null,
    durationSeconds: file.durationSeconds || null,
    accessMode: file.accessMode || "private",
    sharedRole: file.sharedRole || null,
    sharedSource: file.sharedSource || null,
    shareId: file.shareId || null,
    owner: file.owner || null,
    uploadedBy: file.uploadedBy || null,
    isShared: Boolean(file.isShared),
  };
}

function normalizeStorage(storage) {
  return storage
    ? {
        ...storage,
        isUnlimited: Boolean(storage.isUnlimited),
      }
    : null;
}

const UPLOAD_CHUNK_BYTES = 16 * 1024 * 1024;
const UPLOAD_RETRY_LIMIT = 3;

function xhrUploadChunk(uploadId, chunk, start, end, total, onProgress) {
  const xhr = new XMLHttpRequest();

  const upload = (async () => {
    // This will now reuse the existing token OR the currently
    // pending /csrf request.
    const csrf = await ensureCsrf();

    return new Promise((resolve, reject) => {
      xhr.open(
        "PUT",
        endpoint(
          `/v1/uploads/${encodeURIComponent(uploadId)}/chunk`,
        ),
        true,
      );

      xhr.withCredentials = true;

      xhr.setRequestHeader(
        "Content-Type",
        "application/octet-stream",
      );
      xhr.setRequestHeader("Content-Range", `bytes ${start}-${end}/${total}`);

      xhr.setRequestHeader(
        "X-CSRF-Token",
        csrf,
      );

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;

        onProgress?.(
          Math.round(
            event.loaded,
          ),
        );
      };

      xhr.onload = () => {
        let body = null;

        try {
          body = xhr.responseText
            ? JSON.parse(xhr.responseText)
            : null;
        } catch {
          body = {
            error: {
              message: xhr.responseText,
            },
          };
        }

        if (
          xhr.status >= 200 &&
          xhr.status < 300
        ) {
          resolve(body);
        } else {
          reject(
            apiError(
              body,
              `Upload failed (${xhr.status})`,
            ),
          );
        }
      };

      xhr.onerror = () => {
        reject(
          new Error(
            "The upload could not be completed. Check your connection and try again.",
          ),
        );
      };

      xhr.onabort = () => {
        reject(
          new Error("Upload cancelled."),
        );
      };

      xhr.send(chunk);
    });
  })();

  return {
    upload,
    abort: () => xhr.abort(),
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function isRetryableUploadError(error) {
  return !error?.code || ["INTERNAL_ERROR", "UPLOAD_OFFSET_MISMATCH"].includes(error.code);
}

export const driveApi = {
  async list({
    parentId = null,
    pageSize = 25,
    search = "",
    sort = "date:new-first",
    cursor = null,
  } = {}) {
    const result = isMockDrive()
      ? mockDriveList({
          parentId,
          pageSize,
          search,
          sort,
          cursor,
        })
      : await request(
          `/v1/nodes?${new URLSearchParams({
            pageSize: String(pageSize),
            sort,
            ...(parentId
              ? { parentId }
              : {}),
            ...(search
              ? { search }
              : {}),
            ...(cursor
              ? { cursor }
              : {}),
          }).toString()}`,
        );

    return {
      files: (result.items || []).map(
        normalizeFile,
      ),
      breadcrumbs: (
        result.breadcrumbs || []
      ).map(normalizeFile),
      nextCursor:
        result.nextCursor || null,
      storage: normalizeStorage(
        result.storage,
      ),
    };
  },

  async listTrash({
    pageSize = 25,
    cursor = null,
  } = {}) {
    const result = await request(
      `/v1/trash?${new URLSearchParams({
        pageSize: String(pageSize),
        ...(cursor
          ? { cursor }
          : {}),
      }).toString()}`,
    );

    return {
      files: (result.items || []).map(
        normalizeFile,
      ),
      nextCursor:
        result.nextCursor || null,
    };
  },

  async listShared() {
    const result = await request("/v1/shared");
    return { files: (result.items || []).map(normalizeFile), nextCursor: result.nextCursor || null };
  },

  async listSharedChildren(nodeId, { pageSize = 25, cursor = null, search = "", sort = "date:new-first" } = {}) {
    const result = await request(`/v1/shared/${encodeURIComponent(nodeId)}/children?${new URLSearchParams({ pageSize: String(pageSize), sort, ...(cursor ? { cursor } : {}), ...(search ? { search } : {}) }).toString()}`);
    return { files: (result.items || []).map(normalizeFile), breadcrumbs: (result.breadcrumbs || []).map(normalizeFile), role: result.role, nextCursor: result.nextCursor || null };
  },

  getStorageUsage() {
    return isMockDrive()
      ? Promise.resolve(
          normalizeStorage(
            mockSession.storage,
          ),
        )
      : request("/v1/storage").then(
          normalizeStorage,
        );
  },

  getSession() {
    return isMockDrive()
      ? Promise.resolve(mockSession)
      : request("/v1/auth/session");
  },

  async createFolder(
    name,
    parentId = null,
  ) {
    const result = await request(
      "/v1/folders",
      {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          parentId,
        }),
      },
    );

    return normalizeFile(result.item);
  },

  async rename(nodeId, name) {
    const result = await request(
      `/v1/nodes/${encodeURIComponent(nodeId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
        }),
      },
    );

    return normalizeFile(result.item);
  },

  async move(nodeId, parentId) {
    const result = await request(
      `/v1/nodes/${encodeURIComponent(nodeId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          parentId,
        }),
      },
    );

    return normalizeFile(result.item);
  },

  delete(nodeId) {
    return request(
      `/v1/nodes/${encodeURIComponent(nodeId)}?permanent=true`,
      {
        method: "DELETE",
      },
    );
  },

  moveToTrash(nodeId) {
    return request(
      `/v1/nodes/${encodeURIComponent(nodeId)}`,
      {
        method: "DELETE",
      },
    );
  },

  restore(nodeId) {
    return request(
      `/v1/nodes/${encodeURIComponent(nodeId)}/restore`,
      {
        method: "POST",
      },
    );
  },

  listShares(nodeId) {
    return request(
      `/v1/nodes/${encodeURIComponent(nodeId)}/shares`,
    );
  },

  createShare(nodeId, mode, { expiresAt = null, recipientId = null, role = null } = {}) {
    return request(
      `/v1/nodes/${encodeURIComponent(nodeId)}/shares`,
      {
        method: "POST",
        body: JSON.stringify({
          mode,
          expiresAt,
          recipientId,
          role,
        }),
      },
    );
  },

  revokeShare(shareId) {
    return request(
      `/v1/shares/${encodeURIComponent(shareId)}`,
      {
        method: "DELETE",
      },
    );
  },

  updateShareRole(shareId, role) {
    return request(`/v1/shares/${encodeURIComponent(shareId)}`, { method: "PATCH", body: JSON.stringify({ role }) });
  },

  setAccess(nodeId, accessMode) {
    return request(`/v1/nodes/${encodeURIComponent(nodeId)}/access`, { method: "PATCH", body: JSON.stringify({ accessMode }) }).then((result) => normalizeFile(result.item));
  },

  findUsers(query) {
    return request(`/v1/users?${new URLSearchParams({ query }).toString()}`);
  },

  recordPublicOpen(publicId) {
    return request(`/v1/public/${encodeURIComponent(publicId)}/open`, { method: "POST" });
  },

  recordPrivateOpen(token) {
    return request(`/v1/s/${encodeURIComponent(token)}/open`, { method: "POST" });
  },

  publicChildren(publicId, parentId = null) {
    return request(`/v1/public/${encodeURIComponent(publicId)}/children${parentId ? `?${new URLSearchParams({ parentId })}` : ""}`).then((result) => (result.items || []).map(normalizeFile));
  },

  privateChildren(token, parentId = null) {
    return request(`/v1/s/${encodeURIComponent(token)}/children${parentId ? `?${new URLSearchParams({ parentId })}` : ""}`).then((result) => (result.items || []).map(normalizeFile));
  },

  async signIn(email, password) {
    const result = await request(
      "/v1/auth/sign-in",
      {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
        }),
      },
    );

    return result.user;
  },

  async signUp(email, password, username) {
    const result = await request(
      "/v1/auth/sign-up",
      {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          username,
        }),
      },
    );

    return result.user;
  },

  getProfile() {
    return request("/v1/profile");
  },

  updateProfile(username) {
    return request("/v1/profile", { method: "PATCH", body: JSON.stringify({ username }) });
  },

  uploadAvatar(blob) {
    return request("/v1/profile/avatar", { method: "PUT", body: blob, headers: { "Content-Type": "application/octet-stream" } });
  },

  deleteAvatar() {
    return request("/v1/profile/avatar", { method: "DELETE" });
  },

  avatarUrl(user) {
    return user?.avatarUrl ? endpoint(user.avatarUrl) : null;
  },

  async logout() {
    await request(
      "/v1/auth/sign-out",
      {
        method: "POST",
      },
    );

    // Clear both the cached token and any in-flight
    // initialization reference.
    csrfToken = null;
    csrfPromise = null;
  },

  fileUrl(nodeId) {
    return endpoint(
      `/v1/nodes/${encodeURIComponent(nodeId)}/content`,
    );
  },

  thumbnailUrl(nodeId) {
    return endpoint(
      `/v1/nodes/${encodeURIComponent(nodeId)}/thumbnail`,
    );
  },

  downloadUrl(nodeId) {
    return endpoint(
      `/v1/nodes/${encodeURIComponent(nodeId)}/download`,
    );
  },

  publicContentUrl(publicId) {
    return endpoint(
      `/v1/public/${encodeURIComponent(publicId)}/content`,
    );
  },

  privateContentUrl(token) {
    return endpoint(
      `/v1/s/${encodeURIComponent(token)}/content`,
    );
  },

  publicNodeContentUrl(publicId, nodeId, download = false) {
    return endpoint(`/v1/public/${encodeURIComponent(publicId)}/nodes/${encodeURIComponent(nodeId)}/content${download ? "?download=true" : ""}`);
  },

  privateNodeContentUrl(token, nodeId, download = false) {
    return endpoint(`/v1/s/${encodeURIComponent(token)}/nodes/${encodeURIComponent(nodeId)}/content${download ? "?download=true" : ""}`);
  },

  publicInfo(publicId) {
    return request(
      `/v1/public/${encodeURIComponent(publicId)}`,
    );
  },

  privateInfo(token) {
    return request(
      `/v1/s/${encodeURIComponent(token)}`,
    );
  },

  cancelUpload(uploadId) {
    return request(`/v1/uploads/${encodeURIComponent(uploadId)}`, { method: "DELETE" });
  },

  listOpenUploads() {
    return request("/v1/uploads");
  },

  upload(
    file,
    parentId = null,
    onProgress,
    options = {},
  ) {
    let xhrHandle = null;
    let uploadId = options.uploadId || null;
    let cancelled = false;
    let paused = false;

    const upload = (async () => {
      if (!uploadId) {
        const intent = await request(
          "/v1/uploads",
          {
            method: "POST",
            body: JSON.stringify({
              parentId,
              name: file.name,
              contentType: file.type || null,
              sizeBytes: file.size,
            }),
          },
        );
        uploadId = intent.upload.id;
        options.onCreated?.(intent.upload);
      }

      if (cancelled) {
        await request(
          `/v1/uploads/${encodeURIComponent(uploadId)}`,
          {
            method: "DELETE",
          },
        );

        throw new Error(
          "Upload cancelled.",
        );
      }

      let receivedBytes = 0;
      while (receivedBytes < file.size) {
        if (paused) {
          const error = new Error("Upload paused.");
          error.code = "UPLOAD_PAUSED";
          throw error;
        }
        if (cancelled) throw new Error("Upload cancelled.");
        const status = await request(`/v1/uploads/${encodeURIComponent(uploadId)}`);
        if (status.upload.status === "completed") return null;
        if (!["pending", "streaming"].includes(status.upload.status)) throw new Error("This upload is no longer available.");
        receivedBytes = Number(status.upload.receivedBytes || 0);
        onProgress?.(Math.round((receivedBytes / file.size) * 100), receivedBytes);
        const end = Math.min(receivedBytes + UPLOAD_CHUNK_BYTES, file.size) - 1;
        const chunk = file.slice(receivedBytes, end + 1);
        let attempts = 0;
        while (true) {
          try {
            if (paused) {
              const error = new Error("Upload paused.");
              error.code = "UPLOAD_PAUSED";
              throw error;
            }
            xhrHandle = xhrUploadChunk(uploadId, chunk, receivedBytes, end, file.size, (loaded) => onProgress?.(Math.round(((receivedBytes + loaded) / file.size) * 100), receivedBytes + loaded));
            const result = await xhrHandle.upload;
            receivedBytes = Number(result.upload?.receivedBytes ?? end + 1);
            onProgress?.(Math.round((receivedBytes / file.size) * 100), receivedBytes);
            if (result.item) return result.item;
            break;
          } catch (error) {
            if (paused) {
              const pausedError = new Error("Upload paused.");
              pausedError.code = "UPLOAD_PAUSED";
              throw pausedError;
            }
            if (cancelled) throw error;
            attempts += 1;
            if (!isRetryableUploadError(error) || attempts > UPLOAD_RETRY_LIMIT) throw error;
            const status = await request(`/v1/uploads/${encodeURIComponent(uploadId)}`);
            const reconciledBytes = Number(status.upload.receivedBytes || 0);
            if (reconciledBytes !== receivedBytes) {
              receivedBytes = reconciledBytes;
              break;
            }
            await sleep(250 * 2 ** (attempts - 1));
          }
        }
      }
      return null;
    })();

    return {
      upload,

      abort: () => {
        cancelled = true;

        xhrHandle?.abort();

        if (uploadId) {
          request(
            `/v1/uploads/${encodeURIComponent(uploadId)}`,
            {
              method: "DELETE",
            },
          ).catch(() => undefined);
        }
      },

      pause: () => {
        paused = true;
        xhrHandle?.abort();
      },
    };
  },
};
