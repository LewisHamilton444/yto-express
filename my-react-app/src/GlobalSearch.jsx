import React, { useEffect, useRef, useState } from 'react';
import { parcelsApi, ridersApi, sellersApi, accountsApi } from './services/api';
import { Package, Bike, Store, ShieldCheck } from 'lucide-react';

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

export default function GlobalSearch({ onNavigate }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState({ parcels: [], riders: [], sellers: [], admins: [] });
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);
  const snapshotRef = useRef({ at: 0, data: null });

  useEffect(() => {
    const onClickOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim().toLowerCase();
    if (q.length < 2) { setResults({ parcels: [], riders: [], sellers: [], admins: [] }); return; }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        let corpus = snapshotRef.current.data;
        if (!corpus || Date.now() - snapshotRef.current.at > SNAPSHOT_TTL_MS) {
          const [pData, rData, sData, aData] = await Promise.all([
            parcelsApi.list(), ridersApi.list(), sellersApi.list(), accountsApi.list(),
          ]);
          corpus = { parcels: pData, riders: rData, sellers: sData, admins: aData };
          snapshotRef.current = { at: Date.now(), data: corpus };
        }

        const arr = (v) => (Array.isArray(v) ? v : []);
        const parcels = arr(corpus.parcels)
          .filter(p => (p.trackingNumber || '').toLowerCase().includes(q))
          .slice(0, 5);
        const riders = arr(corpus.riders)
          .filter(r => (r.registrationId || '').toLowerCase().includes(q) || (r.riderName || '').toLowerCase().includes(q))
          .slice(0, 5);
        const sellers = arr(corpus.sellers)
          .filter(sl => (sl.fullName || '').toLowerCase().includes(q))
          .slice(0, 5);
        const admins = arr(corpus.admins)
          .filter(ad => (ad.name || '').toLowerCase().includes(q) || (ad.email || '').toLowerCase().includes(q))
          .slice(0, 5);

        setResults({ parcels, riders, sellers, admins });
      } catch (err) {
        console.error('Global search failed:', err);
        // Serve the last good snapshot (stale but useful) instead of blanking.
        const stale = snapshotRef.current.data;
        if (stale) {
          const arr = (v) => (Array.isArray(v) ? v : []);
          const qq = q;
          setResults({
            parcels: arr(stale.parcels).filter(p => (p.trackingNumber || '').toLowerCase().includes(qq)).slice(0, 5),
            riders:  arr(stale.riders).filter(r => (r.registrationId || '').toLowerCase().includes(qq) || (r.riderName || '').toLowerCase().includes(qq)).slice(0, 5),
            sellers: arr(stale.sellers).filter(sl => (sl.fullName || '').toLowerCase().includes(qq)).slice(0, 5),
            admins:  arr(stale.admins).filter(ad => (ad.name || '').toLowerCase().includes(qq) || (ad.email || '').toLowerCase().includes(qq)).slice(0, 5),
          });
        } else {
          setResults({ parcels: [], riders: [], sellers: [], admins: [] });
        }
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const totalResults = results.parcels.length + results.riders.length + results.sellers.length + results.admins.length;

  const go = (pageKey) => { setOpen(false); setQuery(''); onNavigate?.(pageKey); };

  return (
    <div style={s.wrap} ref={wrapRef}>
      <div style={s.inputBox}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a890c0" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          style={s.input}
          placeholder="Search tracking #, Rider ID, Seller name, or Admin..."
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
              {results.parcels.length > 0 && (
                <>
                  <div style={s.groupLabel}>Parcels</div>
                  {results.parcels.map(p => (
                    <div key={p._id} style={s.resultRow} onClick={() => go('manage-parcels')}>
                      <span style={s.resultTitle}><span style={s.resultTitleIcon}><Package size={14} aria-hidden="true" /></span> {p.trackingNumber}</span>
                      <span style={s.resultSub}>{p.status} · {p.destination || '—'}</span>
                    </div>
                  ))}
                </>
              )}
              {results.riders.length > 0 && (
                <>
                  <div style={s.groupLabel}>Riders</div>
                  {results.riders.map(r => (
                    <div key={r._id} style={s.resultRow} onClick={() => go('rider-report')}>
                      <span style={s.resultTitle}><span style={s.resultTitleIcon}><Bike size={14} aria-hidden="true" /></span> {r.riderName}</span>
                      <span style={s.resultSub}>{r.registrationId}</span>
                    </div>
                  ))}
                </>
              )}
              {results.sellers.length > 0 && (
                <>
                  <div style={s.groupLabel}>Sellers</div>
                  {results.sellers.map(sl => (
                    <div key={sl._id} style={s.resultRow} onClick={() => go('seller-report')}>
                      <span style={s.resultTitle}><span style={s.resultTitleIcon}><Store size={14} aria-hidden="true" /></span> {sl.fullName}</span>
                      <span style={s.resultSub}>{sl.registrationId}</span>
                    </div>
                  ))}
                </>
              )}
              {results.admins.length > 0 && (
                <>
                  <div style={s.groupLabel}>Admins</div>
                  {results.admins.map(ad => (
                    <div key={ad._id} style={s.resultRow} onClick={() => go('manage-accounts')}>
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
