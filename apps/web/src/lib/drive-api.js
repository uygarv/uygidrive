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
      ...(options.body && !(options.body instanceof FormData)
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

function xhrUpload(uploadId, file, onProgress) {
  const xhr = new XMLHttpRequest();

  const upload = (async () => {
    // This will now reuse the existing token OR the currently
    // pending /csrf request.
    const csrf = await ensureCsrf();

    return new Promise((resolve, reject) => {
      xhr.open(
        "PUT",
        endpoint(
          `/v1/uploads/${encodeURIComponent(uploadId)}/content`,
        ),
        true,
      );

      xhr.withCredentials = true;

      xhr.setRequestHeader(
        "Content-Type",
        "application/octet-stream",
      );

      xhr.setRequestHeader(
        "X-Upload-Content-Type",
        file.type || "application/octet-stream",
      );

      xhr.setRequestHeader(
        "X-CSRF-Token",
        csrf,
      );

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;

        onProgress?.(
          Math.round(
            (event.loaded / event.total) * 100,
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
          resolve(body?.item || body);
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

      xhr.send(file);
    });
  })();

  return {
    upload,
    abort: () => xhr.abort(),
  };
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

  createShare(nodeId, mode) {
    return request(
      `/v1/nodes/${encodeURIComponent(nodeId)}/shares`,
      {
        method: "POST",
        body: JSON.stringify({
          mode,
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

  async signUp(email, password) {
    const result = await request(
      "/v1/auth/sign-up",
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

  upload(
    file,
    parentId = null,
    onProgress,
  ) {
    let xhrHandle = null;
    let uploadId = null;
    let cancelled = false;

    const upload = (async () => {
      const intent = await request(
        "/v1/uploads",
        {
          method: "POST",
          body: JSON.stringify({
            parentId,
            name: file.name,
            contentType:
              file.type || null,
            sizeBytes: file.size,
          }),
        },
      );

      uploadId = intent.upload.id;

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

      xhrHandle = xhrUpload(
        uploadId,
        file,
        onProgress,
      );

      return xhrHandle.upload;
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
    };
  },
};