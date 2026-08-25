import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import NavBar from "./NavBar.jsx";
import Login from "./Login.jsx";
import Home from "./Home.jsx";
import CourseDetail from "./CourseDetail.jsx";
import Admin from "./Admin.jsx";
import Dashboard from "./Dashboard.jsx";
import Profile from "./Profile.jsx";

/** Redirect to /login when nobody is signed in. */
function RequireAuth({ children }) {
  const { user, authReady } = useAuth();
  const location = useLocation();
  if (!authReady) return <p className="muted">กำลังตรวจสอบการเข้าสู่ระบบ…</p>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

/** As above, and additionally requires the ADMIN role. */
function RequireAdmin({ children }) {
  const { user, isAdmin, authReady } = useAuth();
  const location = useLocation();
  if (!authReady) return <p className="muted">กำลังตรวจสอบการเข้าสู่ระบบ…</p>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!isAdmin) {
    return (
      <section>
        <div className="alert alert-error">
          หน้านี้สำหรับผู้ดูแลระบบเท่านั้น — you are signed in as{" "}
          <strong>{user.username}</strong> ({user.role}). Switch to an ADMIN
          account to open the moderation queue.
        </div>
      </section>
    );
  }
  return children;
}

export default function App() {
  return (
    <>
      <NavBar />
      <div className="container">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Home />
              </RequireAuth>
            }
          />
          <Route
            path="/course/:id"
            element={
              <RequireAuth>
                <CourseDetail />
              </RequireAuth>
            }
          />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/profile/:id"
            element={
              <RequireAuth>
                <Profile />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <Admin />
              </RequireAdmin>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  );
}
