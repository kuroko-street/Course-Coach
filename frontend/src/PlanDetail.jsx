import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "./api.js";
import { useAuth } from "./AuthContext.jsx";

const SEMESTER_OPTIONS = ["1", "2", "summer"];

const WARNING_LABELS = {
  DUPLICATE_CODE: "รหัสซ้ำ — รวมหน่วยกิตเพียงครั้งเดียว",
  INACTIVE_COURSE: "มีรายการที่ปิดแสดง",
};

/**
 * /plans/:id — a single draft study plan: courses grouped by
 * academic_year/semester, each term showing its running credit total and
 * warnings for duplicate course codes and inactive source listings.
 * Source listing terms are separate from the user's planned terms.
 * There are no enrollment, prerequisite, or workload-policy checks.
 * Reload totals after each write so the server remains authoritative.
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

  const [addForm, setAddForm] = useState({ academic_year: new Date().getFullYear()+543, semester: "1" });
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
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const params = new URLSearchParams();
        if (courseSearch.trim()) params.set("search", courseSearch.trim());
        if (courseDept) params.set("department", courseDept);
        const qs = params.toString();
        const data = await api(`/courses${qs ? `?${qs}` : ""}`, {signal:controller.signal});
        setSearchResults(data.courses || []);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message);
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 300);
    return () => {clearTimeout(timer);controller.abort();};
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
        <p className="cc-info">แผนส่วนตัวเท่านั้น ปี/เทอมเป้าหมายด้านล่างแยกจากปี/เทอมของรายการที่ใช้อ้างอิง ไม่ตรวจสิทธิ์ลงทะเบียน วิชาที่เคยผ่าน หรือรับรองว่ามีการเปิดสอนจริง</p>
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
              <span>อ้างอิง {selectedCourse.academic_year}/{selectedCourse.semester} · {(selectedCourse.instructors || []).map(i=>i.name).join(', ')}</span>
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
                  <span className="muted small"> · อ้างอิง {c.academic_year}/{c.semester} · {(c.instructors || []).map(i=>i.name).join(', ')}</span>
                </button>
              ))}
            </div>
          )}

          <form className="add-item-term-form" onSubmit={handleAddItem}>
            <div>
              <label htmlFor="add-year">ปีการศึกษาเป้าหมาย</label>
              <input
                id="add-year"
                type="number"
                value={addForm.academic_year}
                onChange={(e) => setAddForm((prev) => ({ ...prev, academic_year: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="add-semester">เทอมเป้าหมาย</label>
              <select
                id="add-semester"
                value={addForm.semester}
                onChange={(e) => setAddForm((prev) => ({ ...prev, semester: e.target.value }))}
              >
                {SEMESTER_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s==='summer'?'ภาคฤดูร้อน':`เทอม ${s}`}</option>
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
                  ปีเป้าหมาย {term.academic_year} / {term.semester==='summer'?'ภาคฤดูร้อน':`เทอม ${term.semester}`}
                </span>
                <span className="term-credits">{term.total_credits} หน่วยกิต</span>
              </div>

              {term.warnings.length > 0 && (
                <div className="term-warnings">
                  {term.warnings.map((w) => (
                    <span key={w.code} className="warning-badge" title={w.message}>
                      {w.message}
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
                    <div className="muted small">รายการอ้างอิง {item.source_academic_year}/{item.source_semester} · {item.instructor_names}</div>
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
                        <option key={s} value={s}>{s==='summer'?'ภาคฤดูร้อน':`เทอม ${s}`}</option>
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
