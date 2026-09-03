import React from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

/**
 * Catches render/lifecycle errors from any routed page. Without this, one
 * throwing screen unmounted the entire React tree (blank dashboard, dead
 * sidebar) with no way back. On error it renders a small centered recovery
 * card inside the main area — the shell (sidebar/header) keeps working, and
 * the user can retry the page or jump back to the dashboard.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Something went wrong on this page.' };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] page crashed:', error, info?.componentStack);
  }

  reset = () => {
    this.setState({ hasError: false, message: '' });
    // Re-mount the page fresh so transient state (bad data, failed fetch
    // results) doesn't reproduce the crash.
    this.props.onReset?.();
  };

  goHome = () => {
    this.setState({ hasError: false, message: '' });
    this.props.onHome?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 14, minHeight: '60vh', padding: '32px 24px', textAlign: 'center', color: '#7b6d8d',
        }}
        role="alert"
      >
        <span style={{ width: 52, height: 52, borderRadius: '50%', background: '#fdf2f2', color: '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AlertTriangle size={26} aria-hidden="true" />
        </span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#1a0a2e' }}>This page hit an unexpected error</div>
          <div style={{ fontSize: 13, marginTop: 6, maxWidth: 420, lineHeight: 1.5 }}>{this.state.message}</div>
          <div style={{ fontSize: 12, marginTop: 8, opacity: 0.7 }}>The rest of the portal is unaffected — retry the page or head back to the dashboard.</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={this.reset}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 9,
              border: 'none', background: '#f37021', color: 'white', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <RotateCcw size={14} aria-hidden="true" /> Retry page
          </button>
          <button
            type="button"
            onClick={this.goHome}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 9,
              border: '1.5px solid #e0d5f0', background: 'white', color: '#390955', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Home size={14} aria-hidden="true" /> Back to dashboard
          </button>
        </div>
      </div>
    );
  }
}
