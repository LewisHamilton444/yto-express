import React, { useState, useEffect, useCallback } from 'react';
import { adminLogin, API_ROOT } from './services/api';
import './LoginPage.css';

const LoginPage = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [apiHealth, setApiHealth] = useState('checking');

  // Caps Lock detection
  const detectCapsLock = useCallback((e) => {
    try {
      setCapsLock(!!(e.getModifierState && e.getModifierState('CapsLock')));
    } catch {
      setCapsLock(false);
    }
  }, []);

  // Card shake reset on error
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setShaking(false), 520);
    return () => clearTimeout(timer);
  }, [error]);

  // Live backend health probe — tolerant of Render free-tier cold starts.
  // The first attempt can abort quickly; if it fails we retry with a much
  // longer window before ever declaring the API offline (a sleeping backend
  // wakes in ~30-60s). The pill stays "Connecting..." between attempts so a
  // cold start never falsely flashes red.
  useEffect(() => {
    let cancelled = false;
    let ctrl = null;
    let activeTimer = null;

    const tryOnce = (index) => {
      if (cancelled) return;
      const attempts = [
        { timeout: 10000, pauseMs: 800 },  // fast path: warm backend answers in <1s
        { timeout: 45000, pauseMs: 0 },    // cold start: give Render time to wake
      ];
      if (index >= attempts.length) {
        setApiHealth('offline');
        return;
      }
      ctrl = new AbortController();
      const { timeout, pauseMs } = attempts[index];
      activeTimer = setTimeout(() => ctrl.abort(), timeout);
      fetch(API_ROOT, { signal: ctrl.signal })
        .then((res) => {
          if (!cancelled) setApiHealth(res.ok ? 'online' : 'offline');
        })
        .catch(() => {
          if (cancelled) return;
          clearTimeout(activeTimer);
          if (pauseMs > 0) {
            activeTimer = setTimeout(() => tryOnce(index + 1), pauseMs);
          } else {
            tryOnce(index + 1);
          }
        })
        .finally(() => { if (ctrl && !cancelled) clearTimeout(activeTimer); });
    };

    tryOnce(0);
    return () => {
      cancelled = true;
      clearTimeout(activeTimer);
      if (ctrl) ctrl.abort();
    };
  }, []);

  // Form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || success) return;
    setError('');
    setLoading(true);
    try {
      const data = await adminLogin(email.trim().toLowerCase(), password, rememberMe);
      setLoading(false);
      setSuccess(true);
      // Pause on the success check, then play the page exit (fade + slide up)
      // before handing off to the dashboard. Timings mirror the CSS below.
      window.setTimeout(() => setLeaving(true), 260);
      window.setTimeout(() => {
        if (onLogin) onLogin(data);
      }, 720);
    } catch (err) {
      setError(err.message || 'Cannot connect to server.');
      setLoading(false);
      setShaking(true);
    }
  };

  const healthText =
    apiHealth === 'online'
      ? 'System Operational'
      : apiHealth === 'offline'
      ? 'API Offline'
      : 'Connecting...';

  const cardClasses = [
    'login-card',
    shaking ? 'shaking' : '',
    success ? 'success' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={`login-root${leaving ? ' login-root--leaving' : ''}`}
      role="main"
      aria-label="YTO Express Admin Login"
    >
      {/* Decorative ambient glows floating over the photo */}
      <div className="login-ornaments" aria-hidden="true">
        <span className="login-orb login-orb--violet" />
        <span className="login-orb login-orb--orange" />
      </div>

      {/* Page-level brand header — floats top-left over the backdrop */}
      <header className="login-page-header">
        <div className="login-header-brand anim-fade-up anim-d1">
          <div className="login-logo-badge">
            <img src="/assets/yto_express_logo_mark.png" alt="YTO Express" className="login-official-logo" />
          </div>
          <div className="login-header-brand-text">
            <h1 className="login-brand-name">
              YTO <span>EXPRESS</span>
            </h1>
            <p className="login-brand-tagline">Logistics Management System</p>
            <div className="login-brand-divider" />
          </div>
        </div>

        <div className="login-header-meta anim-fade-up anim-d2">
          <div className="login-health-pill" role="status" aria-live="polite" aria-label={`Server status: ${healthText}`}>
            <span className={`login-health-dot ${apiHealth}`} aria-hidden="true" />
            {healthText}
          </div>
          <div className="login-role-tags">
            <span className="login-role-tag">Super Admin</span>
            <span className="login-role-tag">Operations Staff</span>
            <span className="login-role-tag">Hub Receiver</span>
          </div>
        </div>
      </header>

      <div className="login-stage">
        <div className={cardClasses}>
          <div className="login-glass-inner">
            <div className="login-card-header anim-fade-up anim-d1">
              <h2 className="login-card-title">Welcome back</h2>
              <p className="login-card-subtitle">Sign in to your admin account</p>
            </div>

            {error && (
              <div className="login-error" role="alert" aria-live="assertive">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}

            <form className="login-form" onSubmit={handleSubmit} noValidate>
              <div className="login-field anim-fade-up anim-d2">
                <label className="login-label" htmlFor="login-email">
                  Email Address
                </label>
                <div className="login-input-wrap">
                  <svg className="login-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <input
                    id="login-email"
                    type="email"
                    className="login-input"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    aria-required="true"
                  />
                </div>
              </div>

              <div className="login-field anim-fade-up anim-d3">
                <label className="login-label" htmlFor="login-password">
                  Password
                </label>
                <div className="login-input-wrap">
                  <svg className="login-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <input
                    id="login-password"
                    className="login-input"
                    type={showPass ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={detectCapsLock}
                    onKeyUp={detectCapsLock}
                    required
                    autoComplete="current-password"
                    aria-required="true"
                  />
                  <button
                    type="button"
                    className="login-show-pass"
                    onClick={() => setShowPass((p) => !p)}
                    tabIndex={0}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                    aria-pressed={showPass}
                  >
                    {showPass ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                {capsLock && (
                  <span className="login-capslock" role="status" aria-live="polite">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    Caps Lock is on
                  </span>
                )}
              </div>

              <div className="login-options anim-fade-up anim-d4">
                <label className="login-remember" htmlFor="login-remember">
                  <span className="login-checkbox-wrap">
                    <input
                      id="login-remember"
                      type="checkbox"
                      className="login-checkbox-input"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <span className="login-checkbox-custom" aria-hidden="true">
                      <svg className="login-checkbox-check" viewBox="0 0 12 10" fill="none">
                        <polyline
                          points="1.5 5 4.5 8 10.5 2"
                          stroke="#ffffff"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </span>
                  <span>Remember me</span>
                </label>
              </div>

              {/* ── BRAND ORANGE SUBMIT BUTTON (#F37021) ── */}
              <button
                type="submit"
                className="login-btn anim-fade-up anim-d5"
                disabled={loading || success}
                aria-busy={loading}
                aria-label={loading ? 'Signing in' : success ? 'Signed in' : 'Sign in'}
              >
                {loading ? (
                  <span className="login-spinner" aria-hidden="true" />
                ) : success ? (
                  <span className="login-btn-success">
                    <svg className="login-btn-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Signed In
                  </span>
                ) : (
                  <React.Fragment>
                    Sign In
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </React.Fragment>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
