/**
 * Thin fetch wrapper around the backend API.
 *
 * Authentication is carried by an HttpOnly session cookie. The browser sends
 * it automatically and JavaScript never needs to read the credential.
 */

/** Perform an API call and unwrap FastAPI's error shape into an Error. */
export async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: "include",
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
export async function apiUpload(path, { file } = {}) {
  const headers = {};

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers,
    credentials: "include",
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

/** Multipart upload for a named group of files plus ordinary form fields. */
export async function apiUploadMany(path, { files = [], fields = {} } = {}) {
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => formData.append(key, String(value)));
  files.forEach((file) => formData.append("files", file));

  const res = await fetch(`/api${path}`, {
    method: "POST",
    credentials: "include",
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

export function summaryFileDownloadUrl(fileId) {
  return `/api/summary-files/${fileId}/download`;
}
