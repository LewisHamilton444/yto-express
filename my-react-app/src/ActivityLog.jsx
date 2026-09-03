'use client';
import React, { useState, useEffect } from 'react';
import { apiFetch } from './services/localApi';
import Badge from './components/ui/Badge';
import PageHeader from './components/ui/PageHeader';
import CardSectionHeader from './components/ui/CardSectionHeader';
import CardFooter from './components/ui/CardFooter';
import ListSkeleton from './components/ui/ListSkeleton';
import {
  History, CalendarRange, X,
  UserPlus, RefreshCcw, Package, Bike, Store,
} from 'lucide-react';

const ROLE_TONE = { customer: 'blue', seller: 'amber', rider: 'green' };
const ROLE_ICON = { customer: Package, seller: Store, rider: Bike };
const ROLE_ACCENT = {
  customer: { ring: 'ring-blue-500/25', bg: 'bg-blue-50', dot: 'text-blue-600', accent: '#3b82f6' },
  seller:   { ring: 'ring-amber-500/25', bg: 'bg-amber-50', dot: 'text-amber-600', accent: '#f59e0b' },
  rider:    { ring: 'ring-emerald-500/25', bg: 'bg-emerald-50', dot: 'text-emerald-600', accent: '#22c55e' },
};

const TYPE_ICON = { registration: UserPlus, status_change: RefreshCcw };

const ActivityLog = ({ currentUser }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    fetchEvents();
  }, []);

  // A failed/unreachable API is treated the same as "no events yet" — the
  // timeline renders its normal clean empty state rather than an error banner.
  const fetchEvents = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/activity-log?limit=200');
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching activity log:', err);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = events.filter(e => {
    const matchRole = roleFilter === 'all' || e.role === roleFilter;
    const matchType = typeFilter === 'all' || e.type === typeFilter;
    let matchDate = true;
    if (dateFrom) {
      matchDate = matchDate && new Date(e.timestamp) >= new Date(dateFrom);
    }
    if (dateTo) {
      const toEnd = new Date(dateTo);
      toEnd.setHours(23, 59, 59, 999);
      matchDate = matchDate && new Date(e.timestamp) <= toEnd;
    }
    return matchRole && matchType && matchDate;
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return formatDate(dateStr);
  };

  const handleExport = () => {
    const headers = ['Role', 'Name', 'ID', 'Type', 'Status', 'Description', 'Timestamp'];
    const rows = filtered.map(e => [
      e.role, e.actorName, e.actorId, e.type, e.status,
      `"${(e.description || '').replace(/"/g, '""')}"`, e.timestamp,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'yto_activity_log.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const stats = {
    registrations: events.filter(e => e.type === 'registration').length,
    statusChanges: events.filter(e => e.type === 'status_change').length,
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Activity Log"
        subtitle="Global timeline of all registration and status events across roles"
        breadcrumb={['Dashboard', 'System Monitoring', 'Activity Log']}
      />

      {/* Main content card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <CardSectionHeader
          icon={History}
          title="Event Timeline"
          subtitle={`${filtered.length} of ${events.length} events — registration and status-change activity`}
        />

        {/* Control bar */}
        <div className="flex flex-row flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white cursor-pointer font-semibold text-brand-purple"
            >
              <option value="all">All Roles</option>
              <option value="customer">Customers</option>
              <option value="seller">Sellers</option>
              <option value="rider">Riders</option>
            </select>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white cursor-pointer font-semibold text-brand-purple"
            >
              <option value="all">All Types</option>
              <option value="registration">Registrations</option>
              <option value="status_change">Status Changes</option>
            </select>
            <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2">
              <CalendarRange size={14} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-500">From</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-transparent text-xs text-brand-purple outline-none" />
              <span className="text-xs font-semibold text-slate-500">To</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-transparent text-xs text-brand-purple outline-none" />
            </div>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="flex items-center gap-1 rounded-xl bg-red-50 px-2.5 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100"
              >
                <X size={12} /> Clear dates
              </button>
            )}
            <span className="text-xs text-slate-400 whitespace-nowrap">{filtered.length} results</span>
          </div>
          <button
            onClick={handleExport}
            className="mp-export-btn"
            onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '9px 15px',
              borderRadius: 8, border: 'none', background: '#f37021', color: 'white',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="13" height="13">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
        </div>

        {/* Timeline */}
        <div className="px-6 py-4">
          {loading ? (
            <ListSkeleton rows={6} />
          ) : filtered.length === 0 ? (
            <div className="py-12 text-sm text-center text-slate-400">
              {events.length === 0 && !currentUser?.isDemo
                ? 'No active production records found.'
                : 'No records found in this category.'}
            </div>
          ) : (
            <div className="relative">
              <div
                className="absolute bottom-2 left-[16px] top-2 w-0.5 rounded-full opacity-15"
                style={{ background: 'linear-gradient(180deg, #390955 0%, #3b82f6 33%, #f59e0b 66%, #22c55e 100%)' }}
              />
              <div className="space-y-3">
                {filtered.map((evt, idx) => {
                  const accent = ROLE_ACCENT[evt.role] || ROLE_ACCENT.customer;
                  const RoleIcon = ROLE_ICON[evt.role] || Package;
                  const TypeIcon = TYPE_ICON[evt.type] || UserPlus;
                  return (
                    <div key={idx} className="relative pl-10">
                      <div className={`absolute left-0 top-1 z-10 flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 ${accent.bg} ${accent.ring}`}>
                        <RoleIcon size={16} className={accent.dot} />
                      </div>

                      <div
                        className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 hover:bg-slate-50 transition"
                        style={{ borderLeftWidth: 3, borderLeftColor: accent.accent }}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={ROLE_TONE[evt.role] || 'slate'}>{evt.role}</Badge>
                            <span className="text-xs font-bold text-gray-900">{evt.actorName || 'Unknown'}</span>
                            <span className="font-mono text-[10px] text-brand-muted-2">{evt.actorId}</span>
                          </div>
                          <span className="whitespace-nowrap text-[10px] text-brand-muted-2">{formatTimeAgo(evt.timestamp)}</span>
                        </div>
                        <p className="m-0 text-xs leading-relaxed text-gray-500">{evt.description}</p>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[9px] font-bold text-brand-muted ring-1 ring-slate-200">
                            <TypeIcon size={10} /> {evt.type === 'registration' ? 'Registration' : 'Status Change'}
                          </span>
                          <span className="text-[10px] text-brand-purple-300">{formatDate(evt.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <CardFooter
          resultsLabel={`Showing ${filtered.length} of ${events.length} results`}
          pills={[
            { label: 'Registrations', value: stats.registrations, tone: 'blue' },
            { label: 'Status Changes', value: stats.statusChanges, tone: 'amber' },
          ]}
        />
      </div>
    </div>
  );
};

export default ActivityLog;
