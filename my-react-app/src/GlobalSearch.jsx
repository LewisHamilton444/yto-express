import React, { useEffect, useRef, useState } from 'react';
import { parcelsApi, ridersApi, sellersApi, accountsApi } from './services/api';
import { Package, Bike, Store, ShieldCheck } from 'lucide-react';
import { sendSearchHandoff } from './utils/searchHandoff';

const s = {
  wrap:     { position: 'relative', width: 340 },
  inputBox: { display: 'flex', alignItems: 'center', gap: 8, background: '#f5f0fc', border: '1.5px solid transparent', borderRadius: 10, padding: '8px 12px' },
  input:    { border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: '#390955', width: '100%', fontFamily: 'inherit' },
  dropdown: { position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: 'white', borderRadius: 12, boxShadow: '0 12px 32px rgba(57,9,85,0.18)', border: '1px solid #ede4f5', zIndex: 3000, maxHeight: 360, overflowY: 'auto' },
  groupLabel: { fontSize: 10, fontWeight: 800, color: '#a890c0', textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 14px 4px' },
  resultRow: { display: 'flex', flexDirection: 'column', gap: 2, padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid #f7f2fc' },
  resultTitle: { fontSize: 13, fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: 6 },
  resultTitleIcon: { color: '#9b82b2', display: 'flex', flexShrink: 0 },
  resultSub:   { fontSize: 11, color: '#9b82b2' },
  empty:    { padding: '20px 14px', textAlign: 'center', color: '#bbb', fontSize: 12.5 },
};

// Debounced, on-demand cross-entity search — searches by Parcel Tracking
// Number, Rider ID, or Seller Name. Fetches lazily (only once you actually
// type). A 60-second snapshot cache means typing across a session reuses the
// last fetched corpus instead of refetching ALL parcels/riders/sellers/
// accounts on every keystroke; the fetch errors now fall back to the last
// good snapshot instead of silently blanking results.
const SNAPSHOT_TTL_MS = 60_000;

const EMPTY_RESULTS = { parcels: [], riders: [], sellers: [], admins: [] };
const asArray = (v) => (Array.isArray(v) ? v : []);

// One matcher for both the fresh and the stale-snapshot path, so a fix to what
// a search matches can never land in only one of them.
function matchCorpus(corpus, q) {
  const has = (v) => (v || '').toLowerCase().includes(q);
  return {
    parcels: asArray(corpus.parcels).filter(p => has(p.trackingNumber)).slice(0, 5),
    riders:  asArray(corpus.riders).filter(r => has(r.registrationId) || has(r.riderName)).slice(0, 5),
    sellers: asArray(corpus.sellers).filter(sl => has(sl.fullName)).slice(0, 5),
    admins:  asArray(corpus.admins).filter(ad => has(ad.name) || has(ad.email)).slice(0, 5),
  };
}

const joinList = (items) => (
  items.length <= 2 ? items.join(' or ') : `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`
);

// `canOpen(pageKey)` says whether the signed-in role can see a page. A group
// is only searched (and shown) when its destination page is openable — a hub
// receiver used to get rider, seller and admin hits that led to a blank page.
export default function GlobalSearch({ onNavigate, canOpen = () => true }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);
  const snapshotRef = useRef({ at: 0, data: null });

  // Hub receivers work in Hub Receiving; everyone else opens All Parcels.
  const parcelPage = ['manage-parcels', 'hub-parcels'].find(canOpen) || null;
  const riderPage  = canOpen('rider-report') ? 'rider-report' : null;
  const sellerPage = canOpen('seller-report') ? 'seller-report' : null;
  const adminPage  = canOpen('manage-accounts') ? 'manage-accounts' : null;

  useEffect(() => {
    const onClickOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim().toLowerCase();
    if (q.length < 2) { setResults(EMPTY_RESULTS); return; }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        let corpus = snapshotRef.current.data;
        if (!corpus || Date.now() - snapshotRef.current.at > SNAPSHOT_TTL_MS) {
          const [pData, rData, sData, aData] = await Promise.all([
            parcelPage ? parcelsApi.list() : [],
            riderPage  ? ridersApi.list()  : [],
            sellerPage ? sellersApi.list() : [],
            adminPage  ? accountsApi.list() : [],
          ]);
          corpus = { parcels: pData, riders: rData, sellers: sData, admins: aData };
          snapshotRef.current = { at: Date.now(), data: corpus };
        }
        setResults(matchCorpus(corpus, q));
      } catch (err) {
        console.error('Global search failed:', err);
        // Serve the last good snapshot (stale but useful) instead of blanking.
        const stale = snapshotRef.current.data;
        setResults(stale ? matchCorpus(stale, q) : EMPTY_RESULTS);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, parcelPage, riderPage, sellerPage, adminPage]);

  const totalResults = results.parcels.length + results.riders.length + results.sellers.length + results.admins.length;

  // Open the destination page and hand it the record's identifier so its own
  // search box lands on that record (see utils/searchHandoff.js).
  const go = (pageKey, term) => {
    setOpen(false);
    setQuery('');
    sendSearchHandoff(pageKey, term);
    onNavigate?.(pageKey);
  };

  const placeholderTargets = [
    parcelPage && 'tracking #', riderPage && 'Rider ID', sellerPage && 'Seller name', adminPage && 'Admin',
  ].filter(Boolean);

  return (
    <div style={s.wrap} ref={wrapRef}>
      <div style={s.inputBox}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a890c0" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          style={s.input}
          placeholder={placeholderTargets.length ? `Search ${joinList(placeholderTargets)}...` : 'Search...'}
          aria-label="Search the portal"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>

      {open && query.trim().length >= 2 && (
        <div style={s.dropdown}>
          {loading ? (
            <div style={s.empty}>Searching...</div>
          ) : totalResults === 0 ? (
            <div style={s.empty}>No matches for "{query}"</div>
          ) : (
            <>
              {parcelPage && results.parcels.length > 0 && (
                <>
                  <div style={s.groupLabel}>Parcels</div>
                  {results.parcels.map(p => (
                    <div key={p._id} style={s.resultRow} onClick={() => go(parcelPage, p.trackingNumber)}>
                      <span style={s.resultTitle}><span style={s.resultTitleIcon}><Package size={14} aria-hidden="true" /></span> {p.trackingNumber}</span>
                      <span style={s.resultSub}>{p.status} · {p.destination || '—'}</span>
                    </div>
                  ))}
                </>
              )}
              {riderPage && results.riders.length > 0 && (
                <>
                  <div style={s.groupLabel}>Riders</div>
                  {results.riders.map(r => (
                    <div key={r._id} style={s.resultRow} onClick={() => go(riderPage, r.registrationId || r.riderName)}>
                      <span style={s.resultTitle}><span style={s.resultTitleIcon}><Bike size={14} aria-hidden="true" /></span> {r.riderName}</span>
                      <span style={s.resultSub}>{r.registrationId}</span>
                    </div>
                  ))}
                </>
              )}
              {sellerPage && results.sellers.length > 0 && (
                <>
                  <div style={s.groupLabel}>Sellers</div>
                  {results.sellers.map(sl => (
                    <div key={sl._id} style={s.resultRow} onClick={() => go(sellerPage, sl.registrationId || sl.fullName)}>
                      <span style={s.resultTitle}><span style={s.resultTitleIcon}><Store size={14} aria-hidden="true" /></span> {sl.fullName}</span>
                      <span style={s.resultSub}>{sl.registrationId}</span>
                    </div>
                  ))}
                </>
              )}
              {adminPage && results.admins.length > 0 && (
                <>
                  <div style={s.groupLabel}>Admins</div>
                  {results.admins.map(ad => (
                    <div key={ad._id} style={s.resultRow} onClick={() => go(adminPage, ad.email || ad.name)}>
                      <span style={s.resultTitle}><span style={s.resultTitleIcon}><ShieldCheck size={14} aria-hidden="true" /></span> {ad.name}</span>
                      <span style={s.resultSub}>{ad.email} · {ad.role}</span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
