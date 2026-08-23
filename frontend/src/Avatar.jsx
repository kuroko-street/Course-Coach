/**
 * FR-15: every place that credits a user shows their profile picture.
 * Mock users have no `avatar_url` (see db/init.sql) so this renders a
 * generic silhouette placeholder instead of a broken/missing image.
 */
export default function Avatar({ url, size = 32, className = "" }) {
  const style = { width: size, height: size };

  if (url) {
    return <img src={url} alt="" className={`avatar-img ${className}`} style={style} />;
  }

  return (
    <span className={`avatar-placeholder ${className}`} style={style} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="62%" height="62%" fill="currentColor">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20.5C4 16.36 7.58 13 12 13s8 3.36 8 7.5V21H4v-.5z" />
      </svg>
    </span>
  );
}
