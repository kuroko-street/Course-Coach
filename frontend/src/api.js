/**
 * Thin fetch wrapper around the backend API.
 *
 * Every request carries the currently selected mock user in the X-User-Id
 * header. The backend uses that header as its "session" and re-checks the
 * user's role server-side, so hiding a button in the UI is never the only
 * thing standing between a student and an admin endpoint.
 */

const STORAGE_KEY = "coursecoach.user";

export function loadStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeUser(user) {
  if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  else localStorage.removeItem(STORAGE_KEY);
}

/** Perform an API call and unwrap FastAPI's error shape into an Error. */
export async function api(path, { method = "GET", body, userId } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (userId != null) headers["X-User-Id"] = String(userId);

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // FastAPI puts the message in `detail`, which is a string for our own
    // HTTPExceptions and an array for pydantic validation failures.
    const { detail } = data;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
        ? detail.map((d) => d.msg).join(", ")
        : `Request failed (HTTP ${res.status})`;
    throw new Error(message);
  }

  return data;
}

/**
 * Multipart upload wrapper (FR-9). Kept separate from `api()` because a
 * file body must NOT be JSON.stringify'd, and the browser needs to set its
 * own multipart boundary in Content-Type (so we must not set that header).
 */
export async function apiUpload(path, { file, userId } = {}) {
  const headers = {};
  if (userId != null) headers["X-User-Id"] = String(userId);

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers,
    body: formData,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const { detail } = data;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
        ? detail.map((d) => d.msg).join(", ")
        : `Upload failed (HTTP ${res.status})`;
    throw new Error(message);
  }

  return data;
}

/** Absolute-ish path (still relative to origin) for a file download link. */
export function fileDownloadUrl(fileId) {
  return `/api/files/${fileId}/download`;
}
