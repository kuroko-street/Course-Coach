import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "./api.js";
import { StarDisplay } from "./RatingStars.jsx";

/**
 * / — Course Catalog.
 *
 * Lists every course as a card. Search (code, name, or tag — FR-1) and the
 * department filter (FR-2) are both applied server-side by
 * GET /api/courses?search=&department=. A tag clicked from a course card or
 * the course detail page arrives here via ?search=<tag>.
 */
export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [courses, setCourses] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [tags, setTags] = useState([]);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [department, setDepartment] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Department + tag options come from the DB so filters can never drift from data.
  useEffect(() => {
    api("/departments")
      .then((data) => setDepartments(data.departments || []))
      .catch(() => setDepartments([]));
    api("/tags")
      .then((data) => setTags(data.tags || []))
      .catch(() => setTags([]));
  }, []);

  // Debounced: re-query 300ms after the user stops typing / changes department.
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("search", search.trim());
        if (department) params.set("department", department);
        const qs = params.toString();
        const data = await api(`/courses${qs ? `?${qs}` : ""}`);
        setCourses(data.courses || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, department]);

  // Keep the URL's ?search= in sync so tag links / back button behave.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (search.trim()) next.set("search", search.trim());
    else next.delete("search");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const filtered = search.trim() || department;

  return (
    <section>
      <h1>ค้นหารายวิชา</h1>
      <p className="muted">Browse courses and read what other students said.</p>

      <div className="filter-bar">
        <input
          className="search-bar"
          type="search"
          placeholder="ค้นหาด้วยรหัสวิชา, ชื่อวิชา, หรือแท็ก…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="department-select"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          <option value="">ทุกสาขา</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {tags.length > 0 && (
        <div className="tag-chips tag-chips-filter">
          {tags.map((t) => (
            <button
              type="button"
              key={t.tag_id}
              className={`tag-chip tag-chip-button ${
                search.trim() === t.tag_name ? "tag-chip-active" : ""
              }`}
              onClick={() => setSearch(t.tag_name)}
            >
              #{t.tag_name}
            </button>
          ))}
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : courses.length === 0 ? (
        <p className="muted">
          {filtered ? "ไม่พบรายวิชาที่ตรงกับเงื่อนไข" : "No courses yet."}
        </p>
      ) : (
        <div className="course-grid">
          {courses.map((c) => (
            <Link
              to={`/course/${c.course_id}`}
              key={c.course_id}
              className="card course-card"
            >
              <span className="badge">{c.course_code}</span>
              <strong>{c.course_name}</strong>
              <div className="meta">{c.department}</div>
              {c.avg_rating != null && (
                <div className="meta course-rating">
                  <StarDisplay value={Math.round(Number(c.avg_rating))} />
                  <span> {c.avg_rating}/5</span>
                </div>
              )}
              <div className="meta">
                {Number(c.review_count) === 1
                  ? "1 review"
                  : `${c.review_count} reviews`}
              </div>
              {c.tags?.length > 0 && (
                <div className="tag-chips">
                  {c.tags.map((t) => (
                    <span key={t} className="tag-chip tag-chip-static">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
