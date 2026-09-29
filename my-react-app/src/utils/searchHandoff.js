/**
 * One-shot hand-off from the header search to a ledger's own search box.
 *
 * Picking a parcel, rider, seller or account in the header search used to just
 * switch pages, so the person landed on an unfiltered list and had to type the
 * same thing again. The header now leaves the picked record's identifier here
 * and each destination ledger seeds its search box from it, so the record is
 * the first row on arrival.
 *
 * Two arrival paths, because the destination may or may not be on screen yet:
 *  - not mounted: the page reads the term with takeSearchHandoff() when it
 *    first renders;
 *  - already mounted (searching for a record on the page you are on): the page
 *    subscribes with onSearchHandoff() and is told immediately.
 *
 * A term expires after a few seconds so a hand-off that never got consumed
 * cannot filter a page opened much later from the sidebar.
 */
const EVENT = 'yto:search-handoff';
const MAX_AGE_MS = 3000;

let pending = null; // { pageKey, term, at }

/** Leave `term` for the ledger behind `pageKey` and wake it if it is open. */
export function sendSearchHandoff(pageKey, term) {
  const clean = String(term || '').trim();
  if (!clean) return;
  pending = { pageKey, term: clean, at: Date.now() };
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Read and clear the term waiting for `pageKey` ('' when there is none). */
export function takeSearchHandoff(pageKey) {
  if (!pending || pending.pageKey !== pageKey || Date.now() - pending.at > MAX_AGE_MS) return '';
  const { term } = pending;
  pending = null;
  return term;
}

/** Subscribe an already-open ledger; returns the unsubscribe function. */
export function onSearchHandoff(pageKey, apply) {
  const listener = () => {
    const term = takeSearchHandoff(pageKey);
    if (term) apply(term);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
