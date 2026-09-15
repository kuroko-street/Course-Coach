/** Same-origin, cookie-authenticated API client. No credentials stored in JS. */
async function unwrap(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.detail;
    const message = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((item) => item.msg).join(", ") : detail?.message || `คำขอไม่สำเร็จ (HTTP ${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.detail = detail;
    throw error;
  }
  return data;
}
export async function api(path, { method = "GET", body, signal } = {}) {
  return unwrap(await fetch(`/api${path}`, {
    method, signal, credentials: "include",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
}
export async function apiUpload(path, { file } = {}) {
  const form = new FormData();
  form.append("file", file);
  return unwrap(await fetch(`/api${path}`, { method: "POST", credentials: "include", body: form }));
}
export async function apiUploadMany(path, { files = [], fields = {}, signal } = {}) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => form.append(key, String(value)));
  files.forEach((file) => form.append("files", file));
  return unwrap(await fetch(`/api${path}`, { method: "POST", credentials: "include", body: form, signal }));
}
export function summaryFileDownloadUrl(fileId) { return `/api/summary-files/${fileId}/download`; }
export function summaryFilePreviewUrl(fileId) { return `/api/summary-files/${fileId}/preview`; }
