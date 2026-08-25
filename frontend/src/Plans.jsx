import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api.js";
import { useAuth } from "./AuthContext.jsx";

/** Smallest positive N such that "แผนN" isn't already taken (reuses gaps left by deleted plans). */
function nextPlanName(existingPlans) {
  const used = new Set(
    existingPlans
      .map((p) => /^แผน(\d+)$/.exec(p.plan_name))
      .filter(Boolean)
      .map((m) => Number(m[1]))
  );
  let n = 1;
  while (used.has(n)) n++;
  return `แผน${n}`;
}

/**
 * /plans — list of the current student's own draft study plans (Story 5).
 *
 * `GET /api/plans` is self-only: it always scopes to the caller's own
 * X-User-Id, so there's nothing to filter client-side.
 */
export default function Plans() {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api("/plans", { userId: user.user_id });
      setPlans(data.plans || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate() {
    setCreating(true);
    setError("");
    try {
      await api("/plans", {
        method: "POST",
        userId: user.user_id,
        body: { plan_name: nextPlanName(plans) },
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(planId) {
    if (!window.confirm("ลบแผนการเรียนนี้? การลบไม่สามารถย้อนกลับได้")) return;
    setError("");
    try {
      await api(`/plans/${planId}`, { method: "DELETE", userId: user.user_id });
      setPlans((prev) => prev.filter((p) => p.plan_id !== planId));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section>
      <h1>แผนการเรียนของฉัน</h1>
      <p className="muted">
        วางแผนวิชาและหน่วยกิตล่วงหน้าก่อนลงทะเบียนเรียนจริง
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="plan-create-form">
        <button type="button" onClick={handleCreate} disabled={creating}>
          {creating ? "กำลังสร้าง…" : "+ สร้างแผน"}
        </button>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : plans.length === 0 ? (
        <p className="muted">ยังไม่มีแผนการเรียน — สร้างแผนแรกของคุณด้านบน</p>
      ) : (
        <div className="plan-list" style={{ marginTop: 16 }}>
          {plans.map((p) => (
            <div key={p.plan_id} className="card plan-card">
              <Link to={`/plans/${p.plan_id}`} style={{ color: "inherit", textDecoration: "none", flex: 1 }}>
                <strong>{p.plan_name}</strong>
                <div className="meta">
                  {p.item_count} วิชา · {p.total_credits} หน่วยกิตรวม
                </div>
              </Link>
              <button
                type="button"
                className="btn-danger-outline"
                onClick={() => handleDelete(p.plan_id)}
              >
                ลบแผน
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
