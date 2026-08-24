import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api.js";
import { useAuth } from "./AuthContext.jsx";
import Avatar from "./Avatar.jsx";

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
  const { user, login, loginMock, authReady } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const buttonRef = useRef(null);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [mockUsers, setMockUsers] = useState([]);
  const [mockPendingId, setMockPendingId] = useState(null);

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
      .then(async (nextConfig) => {
        setConfig(nextConfig);
        if (nextConfig.mock_login_enabled) {
          const data = await api("/users");
          setMockUsers(data.users);
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  async function handleMockLogin(candidate) {
    setError("");
    setMockPendingId(candidate.user_id);
    try {
      const signedIn = await loginMock(candidate.user_id);
      const from = location.state?.from?.pathname;
      navigate(from || (signedIn.role === "ADMIN" ? "/admin" : "/"), {
        replace: true,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setMockPendingId(null);
    }
  }

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

      {config?.mock_login_enabled && (
        <div className="card mock-login-card">
          <div className="mock-login-heading">
            <div>
              <h2>ผู้ใช้ทดลอง</h2>
              <p className="muted">เลือกบัญชีเพื่อทดสอบระบบบนเครื่องนี้โดยไม่ต้องใช้ Google</p>
            </div>
            <span className="mock-login-badge">DEV ONLY</span>
          </div>
          <div className="user-grid">
            {mockUsers.map((candidate) => (
              <button
                type="button"
                className="card user-card"
                key={candidate.user_id}
                disabled={mockPendingId !== null}
                onClick={() => handleMockLogin(candidate)}
              >
                <Avatar url={candidate.avatar_url} size={40} />
                <strong>{candidate.username}</strong>
                <span className="muted small">{candidate.email}</span>
                <div className="user-card-cta">
                  {mockPendingId === candidate.user_id ? "กำลังเข้าสู่ระบบ…" : `เข้าใช้ในสิทธิ์ ${candidate.role}`}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
