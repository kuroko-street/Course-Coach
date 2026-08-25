import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

/**
 * Top navigation. Always shows who the current user is, and gives a one-click
 * route to the login screen for switching characters mid-demo. The Admin link
 * only appears for ADMIN accounts (the route is guarded regardless).
 */
export default function NavBar() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand">
          Course&nbsp;Coach
        </Link>

        <nav className="nav-links">
          <NavLink to="/" end className="nav-link">
            Catalog
          </NavLink>
          <NavLink to="/dashboard" className="nav-link">
            Dashboard
          </NavLink>
          <NavLink to="/plans" className="nav-link">
            แผนการเรียน
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className="nav-link">
              Admin Queue
            </NavLink>
          )}
        </nav>

        <div className="nav-user">
          {user ? (
            <>
              <Link to={`/profile/${user.user_id}`} className="nav-username">
                {user.username}
                <span className={`role-pill role-${user.role.toLowerCase()}`}>
                  {user.role}
                </span>
              </Link>
              <button type="button" className="btn btn-ghost" onClick={handleLogout}>
                ออกจากระบบ
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn-ghost">
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
