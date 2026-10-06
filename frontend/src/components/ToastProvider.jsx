import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const ToastContext = createContext(null);
const DURATION = { success: 5000, error: 8000, info: 6000 };

function ToastItem({ toast, onDismiss }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(DURATION[toast.type]);

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = window.setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [onDismiss, paused, toast.id]);

  return <div
    className={`app-toast app-toast-${toast.type}${paused ? " is-paused" : ""}`}
    role={toast.type === "error" ? "alert" : "status"}
    onMouseEnter={() => setPaused(true)}
    onMouseLeave={() => setPaused(false)}
    onFocusCapture={() => setPaused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}
  >
    <span className="app-toast-icon" aria-hidden="true">
      {toast.type === "success" ? <svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>
        : toast.type === "error" ? <svg viewBox="0 0 24 24"><path d="M12 7v6m0 4h.01" /></svg>
          : <svg viewBox="0 0 24 24"><path d="M12 11v6m0-10h.01" /></svg>}
    </span>
    <div className="app-toast-copy">
      <strong>{toast.title}</strong>
      {toast.message && <p>{toast.message}</p>}
    </div>
    <button className="app-toast-close" type="button" onClick={() => onDismiss(toast.id)} aria-label={`ปิดแจ้งเตือน: ${toast.title}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5 19 19M19 5 5 19" /></svg>
    </button>
    <span className="app-toast-progress" style={{ animationDuration: `${DURATION[toast.type]}ms` }} aria-hidden="true" />
  </div>;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);
  const dismiss = useCallback(id => setToasts(current => current.filter(toast => toast.id !== id)), []);
  const push = useCallback((type, title, message = "") => {
    const id = ++nextId.current;
    setToasts(current => [...current.slice(-2), { id, type, title, message }]);
    return id;
  }, []);
  const value = useMemo(() => ({
    success: (title, message) => push("success", title, message),
    error: (title, message) => push("error", title, message),
    info: (title, message) => push("info", title, message),
    dismiss,
  }), [push, dismiss]);

  return <ToastContext.Provider value={value}>
    {children}
    <div className="app-toast-viewport" aria-label="การแจ้งเตือน">
      {toasts.map(toast => <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />)}
    </div>
  </ToastContext.Provider>;
}

export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast must be used inside ToastProvider");
  return toast;
}
