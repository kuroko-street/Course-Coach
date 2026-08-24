import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api.js";
import { useAuth } from "./AuthContext.jsx";

const GOOGLE_SCRIPT_ID = "google-identity-services";

function loadGoogleIdentityScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.getElementById(GOOGLE_SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = GOOGLE_SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function Login() {
  const { user, login, authReady } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const buttonRef = useRef(null);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const handleCredential = useCallback(
    async ({ credential }) => {
      setError("");
      setPending(true);
      try {
        const signedIn = await login(credential);
        const from = location.state?.from?.pathname;
        navigate(from || (signedIn.role === "ADMIN" ? "/admin" : "/"), {
          replace: true,
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setPending(false);
      }
    },
    [location.state, login, navigate]
  );

  useEffect(() => {
    api("/auth/config")
      .then(setConfig)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!config?.configured || !buttonRef.current) return;
    let cancelled = false;
    loadGoogleIdentityScript()
      .then(() => {
        if (cancelled) return;
        window.google.accounts.id.initialize({
          client_id: config.google_client_id,
          callback: handleCredential,
          hd: config.allowed_domain,
        });
        buttonRef.current.replaceChildren();
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
          width: 320,
        });
      })
      .catch(() => setError("ไม่สามารถโหลดบริการเข้าสู่ระบบของ Google ได้"));
    return () => {
      cancelled = true;
    };
  }, [config, handleCredential]);

  if (authReady && user) return <Navigate to="/" replace />;

  return (
    <section className="login-page">
      <div className="card google-login-card">
        <div className="login-mark">CC</div>
        <h1>เข้าสู่ระบบ Course Coach</h1>
        <p className="muted">
          ใช้บัญชี Google ของสถาบันเทคโนโลยีพระจอมเกล้าเจ้าคุณทหารลาดกระบัง
        </p>
        <div className="login-domain">
          เฉพาะบัญชี @{config?.allowed_domain || "kmitl.ac.th"}
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {config && !config.configured && (
          <div className="alert alert-error">
            ระบบยังไม่ได้ตั้งค่า Google Client ID กรุณาติดต่อผู้ดูแลระบบ
          </div>
        )}
        <div ref={buttonRef} className="google-button-slot" aria-busy={pending} />
        {pending && <p className="muted small">กำลังตรวจสอบบัญชี…</p>}
        <p className="muted small login-privacy">
          ระบบจะรับเฉพาะชื่อ อีเมล และรูปโปรไฟล์จาก Google โดยไม่รับหรือจัดเก็บรหัสผ่าน
        </p>
      </div>
    </section>
  );
}
