import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { api, loadStoredUser, storeUser } from "./api.js";

const AuthContext = createContext(null);

/**
 * Holds the "currently logged in" mock user.
 *
 * There is no real authentication in Sprint 1 — logging in means POSTing a
 * user_id to /api/auth/login-mock, which writes a LOGIN row to audit_logs and
 * hands the user record back. We persist it to localStorage so a page refresh
 * doesn't drop you back to the login screen mid-demo.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadStoredUser);

  const login = useCallback(async (userId) => {
    const data = await api("/auth/login-mock", {
      method: "POST",
      body: { user_id: userId },
    });
    setUser(data.user);
    storeUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    storeUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, login, logout, isAdmin: user?.role === "ADMIN" }),
    [user, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
