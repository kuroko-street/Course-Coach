import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "./api.js";
import { useAuth } from "./AuthContext.jsx";

const SEMESTER_OPTIONS = ["1", "2", "3"];

const WARNING_LABELS = {
  OVER_CREDIT_CAP: "เกินเกณฑ์หน่วยกิตสูงสุด",
  UNDER_CREDIT_MIN: "ต่ำกว่าเกณฑ์หน่วยกิตขั้นต่ำ",
  HEAVY_TERM: "เทอมนี้มีวิชาภาระงานหนักหลายวิชา",
};

/**
 * /plans/:id — a single draft study plan: courses grouped by
 * academic_year/semester, each term showing its running credit total and
 * soft warnings (over/under credit-cap, heavy-workload term), and each
 * course flagging an unmet prerequisite (Story 2/3/4).
 *
 * All validation here is advisory, not blocking — `PlanService` never
 * rejects an add/move because of it, it just recomputes the warnings on the
 * next GET. So every mutating action below simply calls `load()` again
 * afterward instead of patching local state by hand.
 */
export default function PlanDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const [departments, setDepartments] = useState([]);
  const [courseSearch, setCourseSearch] = useState("");
  const [courseDept, setCourseDept] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);

  const [addForm, setAddForm] = useState({ academic_year: 2568, semester: "1" });
  const [adding, setAdding] = useState(false);

  async function loadPlan() {
    const data = await api(`/plans/${id}`, { userId: user.user_id });
    setPlan(data);
    setNameDraft(data.plan_name);
  }

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      await loadPlan();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Department options for the course picker come from the DB, same as the catalog page.
  useEffect(() => {
    api("/departments")
      .then((data) => setDepartments(data.departments || []))
      .catch(() => setDepartments([]));
  }, []);

  // Debounced course search — same search-by-code/name/tag + department filter as the catalog.
  useEffect(() => {
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const params = new URLSearchParams();
        if (courseSearch.trim()) params.set("search", courseSearch.trim());
        if (courseDept) params.set("department", courseDept);
        const qs = params.toString();
        const data = await api(`/courses${qs ? `?${qs}` : ""}`);
        setSearchResults(data.courses || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [courseSearch, courseDept]);

  async function handleRename(e) {
    e.preventDefault();
    if (!nameDraft.trim()) return;
    setError("");
    try {
      await api(`/plans/${id}`, {
        method: "PUT",
        userId: user.user_id,
        body: { plan_name: nameDraft.trim() },
      });
      setRenaming(false);
      await loadPlan();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAddItem(e) {
    e.preventDefault();
    if (!selectedCourse) {
      setError("กรุณาเลือกวิชาที่จะเพิ่ม");
      return;
    }
    setAdding(true);
    setError("");
    setSuccess("");
    try {
      await api(`/plans/${id}/items`, {
        method: "POST",
        userId: user.user_id,
        body: {
          course_id: selectedCourse.course_id,
          academic_year: Number(addForm.academic_year),
          semester: addForm.semester,
        },
      });
      setSuccess("เพิ่มวิชาลงแผนแล้ว");
      setSelectedCourse(null);
      setCourseSearch("");
      await loadPlan();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleMoveItem(itemId, academic_year, semester) {
    setError("");
    try {
      await api(`/plans/${id}/items/${itemId}`, {
        method: "PUT",
        userId: user.user_id,
        body: { academic_year: Number(academic_year), semester },
      });
      await loadPlan();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemoveItem(itemId) {
    setError("");
    try {
      await api(`/plans/${id}/items/${itemId}`, { method: "DELETE", userId: user.user_id });
      setSuccess("ลบวิชาออกจากแผนแล้ว");
      await loadPlan();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <p className="muted">Loading…</p>;

  if (!plan) {
    return (
      <section>
        {error && <div className="alert alert-error">{error}</div>}
        <Link to="/plans" className="back-link">
          ← กลับไปหน้าแผนการเรียน
        </Link>
      </section>
    );
  }

  return (
    <>
      <Link to="/plans" className="back-link">
        ← กลับไปหน้าแผนการเรียน
      </Link>

      <section className="plan-header-row">
        {renaming ? (
          <form onSubmit={handleRename} style={{ display: "flex", gap: 8, flex: 1 }}>
            <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} autoFocus />
            <button type="submit">บันทึก</button>
            <button type="button" className="btn-ghost" onClick={() => setRenaming(false)}>
              ยกเลิก
            </button>
          </form>
        ) : (
          <>
            <h1 className="course-title" style={{ marginTop: 0 }}>{plan.plan_name}</h1>
            <button type="button" className="btn-ghost" onClick={() => setRenaming(true)}>
              เปลี่ยนชื่อแผน
            </button>
          </>
        )}
      </section>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <section>
        <h2>เพิ่มวิชาลงแผน</h2>
        <div className="card course-picker">
          <div className="filter-bar">
            <input
              className="search-bar"
              type="search"
              placeholder="ค้นหาด้วยรหัสวิชา, ชื่อวิชา, หรือแท็ก…"
              value={courseSearch}
              onChange={(e) => {
                setCourseSearch(e.target.value);
                setSelectedCourse(null);
              }}
            />
            <select
              className="department-select"
              value={courseDept}
              onChange={(e) => {
                setCourseDept(e.target.value);
                setSelectedCourse(null);
              }}
            >
              <option value="">ทุกสาขา</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {selectedCourse ? (
            <div className="selected-course-chip">
              <span className="badge">{selectedCourse.course_code}</span>
              <strong>{selectedCourse.course_name}</strong>
              <button type="button" className="btn-ghost" onClick={() => setSelectedCourse(null)}>
                เปลี่ยนวิชา
              </button>
            </div>
          ) : searchLoading ? (
            <p className="muted">กำลังค้นหา…</p>
          ) : searchResults.length === 0 ? (
            <p className="muted">ไม่พบรายวิชาที่ตรงกับเงื่อนไข</p>
          ) : (
            <div className="course-search-results">
              {searchResults.map((c) => (
                <button
                  type="button"
                  key={c.course_id}
                  className="course-search-item"
                  onClick={() => setSelectedCourse(c)}
                >
                  <span className="badge">{c.course_code}</span>
                  <strong>{c.course_name}</strong>
                  <span className="muted small"> · {c.department}</span>
                </button>
              ))}
            </div>
          )}

          <form className="add-item-term-form" onSubmit={handleAddItem}>
            <div>
              <label htmlFor="add-year">ปีการศึกษา</label>
              <input
                id="add-year"
                type="number"
                value={addForm.academic_year}
                onChange={(e) => setAddForm((prev) => ({ ...prev, academic_year: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="add-semester">เทอม</label>
              <select
                id="add-semester"
                value={addForm.semester}
                onChange={(e) => setAddForm((prev) => ({ ...prev, semester: e.target.value }))}
              >
                {SEMESTER_OPTIONS.map((s) => (
                  <option key={s} value={s}>เทอม {s}</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={adding || !selectedCourse}>
              {adding ? "กำลังเพิ่ม…" : "เพิ่ม"}
            </button>
          </form>
        </div>
      </section>

      <section>
        <h2>ตารางแผนการเรียน</h2>
        {plan.terms.length === 0 ? (
          <p className="muted">ยังไม่มีวิชาในแผนนี้ — เพิ่มวิชาแรกด้านบน</p>
        ) : (
          plan.terms.map((term) => (
            <div key={`${term.academic_year}-${term.semester}`} className="term-block">
              <div className="term-header">
                <span className="term-title">
                  ปีการศึกษา {term.academic_year} / เทอม {term.semester}
                </span>
                <span className="term-credits">{term.total_credits} หน่วยกิต</span>
              </div>

              {term.warnings.length > 0 && (
                <div className="term-warnings">
                  {term.warnings.map((w) => (
                    <span key={w.code} className="warning-badge" title={w.message}>
                      {WARNING_LABELS[w.code] || w.code}
                    </span>
                  ))}
                </div>
              )}

              {term.items.map((item) => (
                <div key={item.item_id} className="card plan-item-row">
                  <div className="plan-item-info">
                    <Link to={`/course/${item.course_id}`} className="badge">
                      {item.course_code}
                    </Link>
                    <strong>{item.course_name}</strong>
                    <span className="muted small"> · {item.credits} หน่วยกิต</span>
                    {item.prerequisite_unmet && (
                      <div>
                        <span className="warning-badge prereq-badge">
                          ต้องผ่าน {item.missing_prerequisites.map((p) => p.course_code).join(", ")} ก่อน
                        </span>
                      </div>
                    )}
                    <div className="plan-item-ratings">
                      {item.avg_satisfaction != null
                        ? `พึงพอใจ ${item.avg_satisfaction} · แนะนำ ${item.avg_recommendation ?? "–"} · งานเหมาะสม ${item.avg_workload ?? "–"}`
                        : "ยังไม่มีรีวิว"}
                    </div>
                  </div>
                  <div className="plan-item-actions">
                    <input
                      type="number"
                      defaultValue={item.academic_year}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (Number(v) !== item.academic_year) handleMoveItem(item.item_id, v, item.semester);
                      }}
                      style={{ width: 90 }}
                    />
                    <select
                      defaultValue={item.semester}
                      onChange={(e) => handleMoveItem(item.item_id, item.academic_year, e.target.value)}
                    >
                      {SEMESTER_OPTIONS.map((s) => (
                        <option key={s} value={s}>เทอม {s}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-danger-outline"
                      onClick={() => handleRemoveItem(item.item_id)}
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </section>
    </>
  );
}
