// Canonical palette for the parcel lifecycle. This used to be copy-pasted —
// byte-for-byte identical in two places — across ManageParcels.jsx,
// GenerateParcelMovement.jsx, and HubParcelReceiving.jsx (each also defining
// its own local `StatusBadge` component to render it). Kept in its own
// module, separate from the StatusBadge component, so Vite's Fast Refresh
// can still hot-reload the component file (it only works when a file
// exclusively exports components).
export const PARCEL_STATUS_COLORS = {
  'Pending':          { bg: '#f3f4f6', color: '#374151' },
  'Picked Up':        { bg: '#ede9fe', color: '#4c1d95' },
  'In Transit':       { bg: '#e0f2fe', color: '#075985' },
  'Out for Delivery': { bg: '#fef3c7', color: '#92400e' },
  'Delivered':        { bg: '#d1fae5', color: '#065f46' },
  'Returned':         { bg: '#f3f4f6', color: '#6b7280' },
  'Failed':           { bg: '#fee2e2', color: '#991b1b' },
};

// Account category badging shared by admin views (CustomerList, ManageIssues, ...).
// Canonical scheme: REAL renders green, DEMO renders neutral gray — matches the
// long-standing inline badges in ManageAccounts / ViewSeller / ManageParcels.
export const ACCOUNT_CATEGORY_TONE = { REAL: 'green', DEMO: 'slate' };
export const ACCOUNT_CATEGORY_LABEL = { REAL: 'Real (Verified)', DEMO: 'Demo' };
