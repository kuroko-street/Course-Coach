# Cloudinary setup for Course Coach

1. Create a Cloudinary Free account. In Console > Settings > API Keys, copy your CLOUDINARY_URL.
2. Set these values in the project's `.env` (ignored by Git):

   ```dotenv
   FILE_STORAGE=cloudinary
   CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
   ```

   Never put the secret in frontend code, a VITE_ variable, screenshots, or Git.
3. In Cloudinary Security settings, enable **Allow delivery of PDF and ZIP files**.
4. Run `docker compose up -d --build backend`. This installs the Python SDK and passes the settings to the backend.
   For native Python, install backend/requirements.txt and export these two environment variables before starting uvicorn; `.env` is read automatically by Compose only.
5. Upload a small PDF, download it while logged in, and verify it appears under `coursecoach/documents` in Cloudinary. Test PNG and Office documents too. Check that logged-out users and hidden/deleted files cannot obtain new download links.

## Behavior

- New documents are stored as private raw assets; validation and the 3-file contribution quota still run before registration. Maximum file size is 10,000,000 bytes in both local and cloud mode.
- Download authorization stays in the backend. Successful requests redirect to a signed Cloudinary URL valid for 60 seconds. Anyone holding that URL can use it until it expires; hiding a file blocks new links, not links already issued.
- New avatars are validated images (maximum 5 MiB) stored publicly on Cloudinary. Profiles save the resulting HTTPS URL.
- Existing local documents and avatars remain readable. They are **not automatically migrated**; retain the existing Docker volumes.
- Failed database writes trigger best-effort remote cleanup. A timeout after Cloudinary accepts an upload or failed cleanup can leave an orphan: inspect storage periodically.
- Hidden/deleted documents and replaced cloud avatars are retained. Include them in storage monitoring; no automatic retention cleanup is enabled.
- `FILE_STORAGE=local` remains the default until credentials are configured. Cloud mode does not silently fall back to local storage after a provider error.
- The checked-in Compose stack is for local development, not a hardened production deployment; follow DEPLOY.md before exposing it publicly.

## Free-plan usage

Storage, delivery bandwidth, and transformations share Cloudinary credits. Private download URLs are not CDN-cached and Cloudinary documents double bandwidth accounting for that delivery method. Monitor Console usage; free does not mean unlimited.

References: https://cloudinary.com/documentation/control_access_to_media and https://cloudinary.com/pricing
