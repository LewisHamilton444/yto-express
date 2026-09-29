import React from 'react';

/**
 * Soft status pill with a glowing dot, for ledger tables and detail modals
 * (styles in LedgerPage.css). `tone`: 'on' (green), 'pending' (amber),
 * 'off' (red) or 'neutral' (slate).
 */
export default function LedgerStatus({ tone = 'neutral', children }) {
  return (
    <span className={`lp-status is-${tone}`}>
      <i className="lp-status-dot" aria-hidden="true" />
      {children}
    </span>
  );
}
