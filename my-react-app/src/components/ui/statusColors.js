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

// Canonical account-status palettes for seller & rider ledgers. ViewSeller and
// GenerateRiderDataReport used to each define their own local copies (one solid
// purple, one tinted-pill style) that drifted apart — now a single source of
// truth, still passable to <StatusBadge colorMap={...} />.
export const SELLER_STATUS_COLORS = {
  ACTIVE:               { bg: '#d1fae5', color: '#065f46' },
  PENDING_VERIFICATION: { bg: '#fef3c7', color: '#92400e' },
  ARCHIVED:             { bg: '#fee2e2', color: '#991b1b' },
};

export const RIDER_STATUS_COLORS = {
  ACTIVE:               { bg: '#e6f9ed', color: '#1e7e34' },
  PENDING_VERIFICATION: { bg: '#fef3c7', color: '#92400e' },
  ARCHIVED:             { bg: '#f3f4f6', color: '#6b7280' },
};

export const RIDER_STATUS_BADGE = {
  ACTIVE:               { bg: '#390955', color: 'white',    border: 'none',                 dot: '#a8ffb0' },
  PENDING_VERIFICATION: { bg: 'white',   color: '#390955',  border: '1.5px solid #390955',  dot: '#f37021' },
  ARCHIVED:             { bg: '#7f8c8d', color: 'white',    border: 'none',                 dot: '#ddd' },
};
