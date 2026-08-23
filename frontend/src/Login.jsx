import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "./api.js";
import { useAuth } from "./AuthContext.jsx";
import Avatar from "./Avatar.jsx";

/**
 * /login — character picker for the demo.
 *
 * Lists the mock users straight from the database and lets the tester become
 * any of them. Each pick writes a LOGIN row into audit_logs via the backend.
 */
export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api("/users");
        if (!cancelled) setUsers(data.users || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePick(candidate) {
    setError("");
    setPending(candidate.user_id);
    try {
      const signedIn = await login(candidate.user_id);
      // Send admins to the queue, everyone else to the catalog — unless the
      // guard bounced them here from somewhere specific.
      const from = location.state?.from?.pathname;
      navigate(from || (signedIn.role === "ADMIN" ? "/admin" : "/"), {
        replace: true,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(null);
    }
  }

  return (
    <section>
      <h1>เลือกผู้ใช้ทดสอบ</h1>
      <p className="muted">
        Sprint 1 has no real authentication — pick a character to switch the
        current session. Every pick is recorded in <code>audit_logs</code>.
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <p className="muted">Loading users…</p>
      ) : (
        <div className="user-grid">
          {users.map((u) => {
            const isCurrent = user?.user_id === u.user_id;
            return (
              <button
                key={u.user_id}
                type="button"
                className={`card user-card ${isCurrent ? "user-card-current" : ""}`}
                onClick={() => handlePick(u)}
                disabled={pending !== null}
              >
                <Avatar url={u.avatar_url} size={40} />
                <strong>{u.username}</strong>
                <span className={`role-pill role-${u.role.toLowerCase()}`}>
                  {u.role}
                </span>
                <div className="meta">{u.email}</div>
                {u.is_report_blocked && (
                  <div className="meta warn">reporting suspended</div>
                )}
                <div className="user-card-cta">
                  {pending === u.user_id
                    ? "Signing in…"
                    : isCurrent
                    ? "Current user — continue"
                    : "Sign in as this user"}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
