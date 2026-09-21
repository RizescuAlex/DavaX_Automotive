import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../config/firebase";
import { apiFetch } from "../config/api";
import { useAuth } from "./useAuth";
import { useAppStore } from "../store";
import { APP_NAME, ROUTES } from "../config/constants";

// ── Sub-components ────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

function FormInput({ id, type = "text", label, value, onChange, placeholder, autoComplete }) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        className="form-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
      />
    </div>
  );
}

// ── Google Tab ────────────────────────────────────────────────────────────────

function GoogleTab({ onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ id_token: idToken }),
      });
      onSuccess(data);
    } catch (err) {
      console.error("Google sign-in failed:", err);
      setError(err.message || "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-tab-panel">
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button
        id="google-sign-in-btn"
        className="btn btn-google"
        onClick={handleGoogleSignIn}
        disabled={loading}
        style={{ width: "100%" }}
      >
        <GoogleIcon />
        {loading ? "Signing in…" : "Continue with Google"}
      </button>
      <p className="auth-footnote">
        Sign in with your Google account. Your data stays private.
      </p>
    </div>
  );
}

// ── Email Tab ─────────────────────────────────────────────────────────────────

function EmailTab({ onSuccess }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Shared fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Register-only fields
  const [displayName, setDisplayName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      let data;
      if (mode === "login") {
        data = await apiFetch("/auth/login/email", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
      } else {
        data = await apiFetch("/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, password, display_name: displayName || null }),
        });
      }
      onSuccess(data, "email");
    } catch (err) {
      console.error("Email auth failed:", err);
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    setMode(mode === "login" ? "register" : "login");
    setError(null);
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="auth-tab-panel">
      {error && <div className="auth-error" role="alert">{error}</div>}
      <form id="email-auth-form" onSubmit={handleSubmit} noValidate>
        {mode === "register" && (
          <FormInput
            id="display-name"
            label="Display Name"
            value={displayName}
            onChange={setDisplayName}
            placeholder="Your name"
            autoComplete="name"
          />
        )}
        <FormInput
          id="auth-email"
          type="email"
          label="Email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoComplete="email"
        />
        <FormInput
          id="auth-password"
          type="password"
          label="Password"
          value={password}
          onChange={setPassword}
          placeholder={mode === "register" ? "Min. 8 characters" : "Your password"}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
        {mode === "register" && (
          <FormInput
            id="auth-confirm-password"
            type="password"
            label="Confirm Password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Repeat your password"
            autoComplete="new-password"
          />
        )}
        <button
          id="email-auth-submit-btn"
          type="submit"
          className="btn btn-primary"
          disabled={loading}
          style={{ width: "100%", marginTop: "var(--space-2)" }}
        >
          {loading
            ? mode === "login" ? "Signing in…" : "Creating account…"
            : mode === "login" ? "Sign In" : "Create Account"}
        </button>
      </form>
      <div className="auth-toggle">
        {mode === "login" ? (
          <>Don't have an account?{" "}
            <button id="switch-to-register-btn" className="auth-toggle-btn" onClick={toggle}>Register</button>
          </>
        ) : (
          <>Already have an account?{" "}
            <button id="switch-to-login-btn" className="auth-toggle-btn" onClick={toggle}>Sign In</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Login Page ───────────────────────────────────────────────────────────

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState("google");
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { setCustomAuth, setBackendUser } = useAppStore();

  // Redirect once authentication actually completes. This is the only place we
  // navigate away from login: isAuthenticated only turns true after the backend
  // profile has landed, so onboarding_completed is known by the time we read it.
  useEffect(() => {
    if (isAuthenticated) {
      if (user?.onboarding_completed === false) {
        navigate(ROUTES.ONBOARDING, { replace: true });
      } else {
        navigate(ROUTES.DASHBOARD, { replace: true });
      }
    }
  }, [isAuthenticated, navigate, user]);

  if (isAuthenticated) return null;

  const handleSuccess = (data, provider = "google") => {
    if (provider === "email") {
      // Store custom JWT and user info for email/password auth
      setCustomAuth(data.access_token, {
        id: data.user_id,
        email: data.email,
        display_name: data.display_name,
        onboarding_completed: data.onboarding_completed,
      });
    } else {
      // Google: POST /auth/login is what creates the row on first sign-in, so its
      // response is the authoritative profile. Storing it flips isAuthenticated,
      // and the effect above handles the redirect.
      setBackendUser(data);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Header */}
        <div className="logo">
          {APP_NAME}<span>.</span>
        </div>
        <p className="subtitle">AI-Powered Automotive Assistant</p>

        {/* Tabs */}
        <div className="auth-tabs" role="tablist">
          <button
            id="tab-google"
            role="tab"
            aria-selected={activeTab === "google"}
            className={`auth-tab ${activeTab === "google" ? "active" : ""}`}
            onClick={() => setActiveTab("google")}
          >
            <GoogleIcon />
            Google
          </button>
          <button
            id="tab-email"
            role="tab"
            aria-selected={activeTab === "email"}
            className={`auth-tab ${activeTab === "email" ? "active" : ""}`}
            onClick={() => setActiveTab("email")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            </svg>
            Email
          </button>
        </div>

        {/* Tab Panels */}
        {activeTab === "google" && <GoogleTab onSuccess={handleSuccess} />}
        {activeTab === "email" && <EmailTab onSuccess={handleSuccess} />}
      </div>
    </div>
  );
}
