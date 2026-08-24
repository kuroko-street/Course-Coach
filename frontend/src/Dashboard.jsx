import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api.js";
import { RATING_LABELS } from "./RatingStars.jsx";

const TABS = [
  { id: "reviews", label: "รีวิวมากที่สุด" },
  { id: "likes", label: "ได้รับความสนใจ" },
  { id: "aspects", label: "คะแนนรายด้าน" },
];

const ASPECTS = [
  "satisfaction", "teaching", "content", "difficulty", "workload", "exam",
];

const METRIC_LABELS = {
  reviews: "จำนวนรีวิว",
  likes: "จำนวนถูกใจ",
  comments: "ความคิดเห็น",
  ...RATING_LABELS,
};

function SummaryCard({ value, label }) {
  return (
    <div className="card dashboard-summary-card">
      <strong>{value ?? "–"}</strong>
      <span className="muted">{label}</span>
    </div>
  );
}

function displayMetric(value, metric) {
  if (value == null) return "–";
  if (["reviews", "likes", "comments"].includes(metric)) return Number(value);
  return Number(value).toFixed(2);
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [activeTab, setActiveTab] = useState("reviews");
  const [aspect, setAspect] = useState("satisfaction");
  const [department, setDepartment] = useState("");
  const [minReviews, setMinReviews] = useState("0");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const metric = useMemo(
    () => (activeTab === "aspects" ? aspect : activeTab),
    [activeTab, aspect]
  );

  useEffect(() => {
    Promise.all([api("/dashboard/summary"), api("/departments")])
      .then(([summaryData, departmentData]) => {
        setSummary(summaryData.summary || null);
        setDepartments(departmentData.departments || []);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ metric, min_reviews: minReviews });
    if (department) params.set("department", department);

    api(`/dashboard/rankings?${params}`)
      .then((data) => {
        if (!cancelled) setRankings(data.rankings || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [metric, department, minReviews]);

  return (
    <section>
      <h1>ภาพรวมและอันดับรายวิชา</h1>
      <p className="muted">สำรวจข้อมูลรีวิวและเลือกมุมมองการจัดอันดับที่ต้องการ</p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="dashboard-summary-grid">
        <SummaryCard value={summary?.course_count} label="รายวิชา" />
        <SummaryCard value={summary?.review_count} label="รีวิวที่เผยแพร่" />
        <SummaryCard value={summary?.reviewer_count} label="ผู้รีวิว" />
        <SummaryCard value={summary?.total_likes} label="ถูกใจ" />
        <SummaryCard value={summary?.total_comments} label="ความคิดเห็น" />
        <SummaryCard value={summary?.avg_satisfaction ?? "–"} label="ความพึงพอใจเฉลี่ย" />
      </div>

      <div className="dashboard-tabs" role="tablist" aria-label="ประเภทอันดับ">
        {TABS.map((tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            key={tab.id}
            className={activeTab === tab.id ? "dashboard-tab-active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <button type="button" disabled title="กำลังรอเกณฑ์คะแนนจากทีมที่รับผิดชอบ">
          วิชาแนะนำ — รอเกณฑ์
        </button>
      </div>

      <div className="dashboard-controls">
        {activeTab === "aspects" && (
          <label>
            ด้านคะแนน
            <select value={aspect} onChange={(event) => setAspect(event.target.value)}>
              {ASPECTS.map((field) => (
                <option key={field} value={field}>{RATING_LABELS[field]}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          ภาควิชา
          <select value={department} onChange={(event) => setDepartment(event.target.value)}>
            <option value="">ทุกสาขา</option>
            {departments.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          รีวิวขั้นต่ำ
          <select value={minReviews} onChange={(event) => setMinReviews(event.target.value)}>
            <option value="0">ทั้งหมด</option>
            <option value="3">3+</option>
            <option value="5">5+</option>
            <option value="10">10+</option>
          </select>
        </label>
      </div>

      <div className="dashboard-ranking-heading">
        <h2>{TABS.find((tab) => tab.id === activeTab)?.label}</h2>
        <p className="muted small">
          {["difficulty", "workload", "exam"].includes(metric)
            ? "คะแนนสูงแสดงระดับที่ผู้รีวิวรับรู้ ไม่ได้หมายถึงคุณภาพดีกว่าหรือแย่กว่า"
            : `เรียงตาม${METRIC_LABELS[metric]}จากมากไปน้อย`}
        </p>
      </div>

      {loading && rankings.length === 0 ? (
        <p className="muted">กำลังโหลดข้อมูล…</p>
      ) : rankings.length === 0 ? (
        <div className="card dashboard-empty">ไม่พบรายวิชาที่มีจำนวนรีวิวตามเงื่อนไข</div>
      ) : (
        <div className="dashboard-results" aria-busy={loading}>
          <div className="dashboard-refresh-slot" aria-live="polite">
            {loading ? "กำลังอัปเดตอันดับ…" : ""}
          </div>
          <div className={`ranking-list ${loading ? "ranking-list-refreshing" : ""}`}>
            {rankings.map((course, index) => (
              <Link to={`/course/${course.course_id}`} key={course.course_id} className="card ranking-card">
                <span className="ranking-rank">#{index + 1}</span>
                <div className="ranking-body">
                  <div>
                    <span className="badge">{course.course_code}</span>
                    <strong>{course.course_name}</strong>
                  </div>
                  <div className="meta">{course.department}</div>
                  {course.review_count === 0 && <div className="muted small">ยังไม่มีข้อมูลรีวิว</div>}
                </div>
                <div className="ranking-stats">
                  <div className="ranking-stat ranking-stat-primary">
                    <strong>{displayMetric(course.metric_value, metric)}</strong>
                    <span className="muted small">{METRIC_LABELS[metric]}</span>
                  </div>
                  <div className="ranking-stat">
                    <strong>{course.review_count}</strong>
                    <span className="muted small">รีวิว</span>
                  </div>
                  <div className="ranking-stat">
                    <strong>{course.total_likes}</strong>
                    <span className="muted small">ถูกใจ</span>
                  </div>
                  <div className="ranking-stat">
                    <strong>{course.total_comments}</strong>
                    <span className="muted small">ความคิดเห็น</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
