'use client';
import React, { useEffect, useRef, useState } from 'react';

const API = 'https://yto-express.onrender.com/api';

const s = {
  wrap:     { position: 'relative', width: 340 },
  inputBox: { display: 'flex', alignItems: 'center', gap: 8, background: '#f5f0fc', border: '1.5px solid transparent', borderRadius: 10, padding: '8px 12px' },
  input:    { border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: '#390955', width: '100%', fontFamily: 'inherit' },
  dropdown: { position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: 'white', borderRadius: 12, boxShadow: '0 12px 32px rgba(57,9,85,0.18)', border: '1px solid #ede4f5', zIndex: 3000, maxHeight: 360, overflowY: 'auto' },
  groupLabel: { fontSize: 10, fontWeight: 800, color: '#a890c0', textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 14px 4px' },
  resultRow: { display: 'flex', flexDirection: 'column', gap: 2, padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid #f7f2fc' },
  resultTitle: { fontSize: 13, fontWeight: 700, color: '#1a1a1a' },
  resultSub:   { fontSize: 11, color: '#9b82b2' },
  empty:    { padding: '20px 14px', textAlign: 'center', color: '#bbb', fontSize: 12.5 },
};

// Debounced, on-demand cross-entity search — searches by Parcel Tracking
// Number, Rider ID, or Seller Name. Fetches lazily (only once you actually
// type) rather than keeping a background poll running just for search.
export default function GlobalSearch({ onNavigate }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState({ parcels: [], riders: [], sellers: [] });
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim().toLowerCase();
    if (q.length < 2) { setResults({ parcels: [], riders: [], sellers: [] }); return; }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const [pRes, rRes, sRes] = await Promise.all([
          fetch(`${API}/parcels`), fetch(`${API}/riders`), fetch(`${API}/sellers`),
        ]);
        const [pData, rData, sData] = await Promise.all([pRes.json(), rRes.json(), sRes.json()]);

        const parcels = (Array.isArray(pData) ? pData : [])
          .filter(p => (p.trackingNumber || '').toLowerCase().includes(q))
          .slice(0, 5);
        const riders = (Array.isArray(rData) ? rData : [])
          .filter(r => (r.registrationId || '').toLowerCase().includes(q) || (r.riderName || '').toLowerCase().includes(q))
          .slice(0, 5);
        const sellers = (Array.isArray(sData) ? sData : [])
          .filter(sl => (sl.fullName || '').toLowerCase().includes(q))
          .slice(0, 5);

        setResults({ parcels, riders, sellers });
      } catch (err) {
        console.error('Global search failed:', err);
        setResults({ parcels: [], riders: [], sellers: [] });
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const totalResults = results.parcels.length + results.riders.length + results.sellers.length;

  const go = (pageKey) => { setOpen(false); setQuery(''); onNavigate?.(pageKey); };

  return (
    <div style={s.wrap} ref={wrapRef}>
      <div style={s.inputBox}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a890c0" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          style={s.input}
          placeholder="Search tracking #, Rider ID, or Seller name..."
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
                      <span style={s.resultTitle}>📦 {p.trackingNumber}</span>
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
                      <span style={s.resultTitle}>🛵 {r.riderName}</span>
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
                      <span style={s.resultTitle}>🏪 {sl.fullName}</span>
                      <span style={s.resultSub}>{sl.registrationId}</span>
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
