import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import NavBar from "./NavBar.jsx";
import Login from "./Login.jsx";
import Home from "./Home.jsx";
import CourseCreate from "./CourseCreate.jsx";
import CourseDetail from "./CourseDetail.jsx";
import Admin from "./Admin.jsx";
import Dashboard from "./Dashboard.jsx";
import Profile from "./Profile.jsx";
import Instructor from "./Instructor.jsx";
import Plans from "./Plans.jsx";
import PlanDetail from "./PlanDetail.jsx";
import CourseReviewsPage from "./CourseReviewsPage.jsx";
import CourseSummaryFilesPage from "./CourseSummaryFilesPage.jsx";

function RequireAuth({ children, admin = false }) {
  const { user, authReady, isAdmin } = useAuth();
  const location = useLocation();
  if (!authReady) return <p className="muted">กำลังตรวจสอบการเข้าสู่ระบบ…</p>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (admin && !isAdmin) return <p className="alert alert-error">หน้านี้สำหรับผู้ดูแลข้อมูลรายวิชาเท่านั้น</p>;
  return children;
}

export default function App() {
  return <><NavBar /><main id="main-content" className="container" tabIndex={-1}><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/" element={<Home />} />
    <Route path="/courses/new" element={<RequireAuth><CourseCreate /></RequireAuth>} />
    <Route path="/course/:id" element={<CourseDetail />} />
    <Route path="/course/:id/reviews" element={<CourseReviewsPage />} />
    <Route path="/course/:id/summary-files" element={<CourseSummaryFilesPage />} />
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/profile/:id" element={<Profile />} />
    <Route path="/instructor/:id" element={<Instructor />} />
    <Route path="/plans" element={<RequireAuth><Plans /></RequireAuth>} />
    <Route path="/plans/:id" element={<RequireAuth><PlanDetail /></RequireAuth>} />
    <Route path="/admin" element={<RequireAuth admin><Admin /></RequireAuth>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></main></>;
}
