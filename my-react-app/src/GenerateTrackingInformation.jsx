import React, { useState, useEffect, useMemo } from 'react';
import { parcelsApi } from './services/api';
import { useToast } from './components/ui/useToast';
import Tooltip from './components/ui/Tooltip';
import PageHeader from './components/ui/PageHeader';
import SectionCard from './components/ui/SectionCard';
import CardSectionHeader from './components/ui/CardSectionHeader';
import DataTable from './components/ui/DataTable';
import TableSkeleton from './components/ui/TableSkeleton';
import EmptyState from './components/ui/EmptyState';
import Badge from './components/ui/Badge';
import FilterBar from './components/ui/FilterBar';
import PaginationControls from './PaginationControls';
import RefreshButton from './components/ui/RefreshButton';
import ExportDropdown from './components/ui/ExportDropdown';
import { exportToCSV, exportToExcel, exportToWord, exportToPDF } from './exportUtils';
import {
  CheckCircle2, Download, FileText, Loader2, Search,
  Calendar, Hash, MapPin, Tag, Clock, Eye, Package,
} from 'lucide-react';

const statusColor = (s) => s === 'Delivered' ? '#065f46' : s === 'In Transit' ? '#f37021' : '#390955';
const statusBg    = (s) => s === 'Delivered' ? '#d1fae5' : s === 'In Transit' ? '#fff4ec' : '#f0eaf8';

const escHtml = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const REPORT_TABLE_HEADERS = [
  { label: 'Report ID', icon: Hash },
  { label: 'Tracking Number', icon: Hash },
  { label: 'Destination / Route', icon: MapPin },
  { label: 'Report Type', icon: Tag },
  { label: 'Export Format', icon: FileText },
  { label: 'Generated Date', icon: Clock },
  { label: 'Actions', icon: null },
];

const REPORT_LEDGER_EXPORT_COLUMNS = [
  { key: 'id', label: 'Report ID' },
  { key: 'trackingNo', label: 'Tracking Number' },
  { key: 'location', label: 'Destination / Route' },
  { key: 'reportType', label: 'Report Type' },
  { key: 'format', label: 'Export Format' },
  { key: 'generatedDate', label: 'Generated Date' },
];

export default function GenerateTrackingInformation({ reports: externalReports, onReportsChange }) {
  const [parcels,        setParcels]        = useState([]);
  const [loadingParcels, setLoadingParcels] = useState(true);
  const [parcelFilter,   setParcelFilter]   = useState('');
  const [selectedParcel, setSelectedParcel] = useState('');
  const [reportType,     setReportType]     = useState('Full Report');
  const [fileFormat,     setFileFormat]     = useState('PDF');
  const [startDate,      setStartDate]      = useState('');
  const [endDate,        setEndDate]        = useState('');
  const [previewReport,  setPreviewReport]  = useState(null);
  const [generating,     setGenerating]     = useState(false);
  const [isRefreshing,   setIsRefreshing]   = useState(false);

  // Generated Reports Ledger state: search, filtering, pagination
  const [reportSearchTerm,   setReportSearchTerm]   = useState('');
  const [reportFormatFilter, setReportFormatFilter] = useState('All');
  const [reportTypeFilter,   setReportTypeFilter]   = useState('All');
  const [reportCurrentPage,  setReportCurrentPage]  = useState(1);
  const [reportRowsPerPage,  setReportRowsPerPage]  = useState(10);
  const toast = useToast();

  const [_reports, _setReports] = useState([]);
  const reports    = externalReports ?? _reports;
  const setReports = (updater) => {
    const next = typeof updater === 'function' ? updater(reports) : updater;
    _setReports(next);
    onReportsChange?.(next);
  };

  const showSuccess = (msg) => toast(msg);

  // Fetch parcels from MongoDB
  const fetchParcels = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setLoadingParcels(true);
    try {
      const data = await parcelsApi.list();
      const list = Array.isArray(data) ? data : [];
      setParcels(list);
      if (list.length > 0 && !selectedParcel && list[0].trackingNumber) {
        setSelectedParcel(list[0].trackingNumber);
      }
      if (isManual) toast('Parcels updated successfully.');
    } catch (err) {
      console.error('Error fetching parcels:', err);
      if (isManual) toast('Unable to refresh parcels. Check your network connection.', 'error');
      setParcels([]);
    } finally {
      setLoadingParcels(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchParcels();
  }, []);

  const handleRefresh = () => {
    fetchParcels(true);
  };

  const currentParcelDetails = useMemo(() => {
    if (!selectedParcel) return null;
    return parcels.find(p => p.trackingNumber === selectedParcel) || null;
  }, [parcels, selectedParcel]);

  const filteredParcelsForSelect = useMemo(() => {
    const term = parcelFilter.trim().toLowerCase();
    if (!term) return parcels;
    return parcels.filter(p =>
      (p.trackingNumber && p.trackingNumber.toLowerCase().includes(term)) ||
      (p.destination && p.destination.toLowerCase().includes(term)) ||
      (p.origin && p.origin.toLowerCase().includes(term)) ||
      (p.senderName && p.senderName.toLowerCase().includes(term)) ||
      (p.receiverName && p.receiverName.toLowerCase().includes(term))
    );
  }, [parcels, parcelFilter]);

  // Filtered reports for the Generated Reports Ledger
  const filteredReports = useMemo(() => {
    const term = reportSearchTerm.trim().toLowerCase();
    return reports.filter((r) => {
      if (reportFormatFilter !== 'All' && r.format !== reportFormatFilter) return false;
      if (reportTypeFilter !== 'All' && r.reportType !== reportTypeFilter) return false;
      if (!term) return true;
      return (
        (r.id && r.id.toLowerCase().includes(term)) ||
        (r.trackingNo && r.trackingNo.toLowerCase().includes(term)) ||
        (r.location && r.location.toLowerCase().includes(term)) ||
        (r.reportType && r.reportType.toLowerCase().includes(term)) ||
        (r.format && r.format.toLowerCase().includes(term))
      );
    });
  }, [reports, reportSearchTerm, reportFormatFilter, reportTypeFilter]);

  const reportTotalPages = Math.max(1, Math.ceil(filteredReports.length / reportRowsPerPage));
  const reportSafePage = Math.min(reportCurrentPage, reportTotalPages);
  const currentReportRows = useMemo(() => {
    return filteredReports.slice((reportSafePage - 1) * reportRowsPerPage, reportSafePage * reportRowsPerPage);
  }, [filteredReports, reportSafePage, reportRowsPerPage]);

  const handleExportLedger = (format) => {
    const data = filteredReports.map((r) => ({
      id: r.id,
      trackingNo: r.trackingNo,
      location: r.location,
      reportType: r.reportType,
      format: r.format,
      generatedDate: r.generatedDate,
    }));
    if (format === 'excel') {
      exportToExcel(data, REPORT_LEDGER_EXPORT_COLUMNS, 'tracking-reports-ledger');
    } else if (format === 'word') {
      exportToWord(data, REPORT_LEDGER_EXPORT_COLUMNS, 'tracking-reports-ledger', 'Tracking Reports Ledger');
    } else if (format === 'pdf') {
      exportToPDF(data, REPORT_LEDGER_EXPORT_COLUMNS, 'tracking-reports-ledger', 'Tracking Reports Ledger');
    } else {
      exportToCSV(data, REPORT_LEDGER_EXPORT_COLUMNS, 'tracking-reports-ledger');
    }
  };

  const handleGenerate = () => {
    if (!selectedParcel) { toast('Please select a parcel tracking number.', 'error'); return; }
    setGenerating(true);
    setTimeout(() => {
      const parcelInfo = parcels.find(p => p.trackingNumber === selectedParcel);
      const newId  = `LOCAL-${String(reports.length + 1).padStart(3, '0')}`;
      const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');

      // Real event filtering by user-provided date range
      let rawEvents = parcelInfo?.events || [
        { time: nowStr, event: 'Report generated', location: parcelInfo?.destination || 'Unknown', status: parcelInfo?.status || 'Active' }
      ];
      if (startDate) {
        rawEvents = rawEvents.filter(e => !e.time || e.time.slice(0, 10) >= startDate);
      }
      if (endDate) {
        rawEvents = rawEvents.filter(e => !e.time || e.time.slice(0, 10) <= endDate);
      }

      const newReport = {
        id: newId,
        trackingNo: selectedParcel,
        generatedDate: nowStr,
        reportType,
        format: fileFormat,
        status: 'Available',
        location: parcelInfo?.destination || parcelInfo?.origin || 'Unknown',
        startDate, endDate,
        events: rawEvents,
        parcelInfo,
      };
      setReports(prev => [newReport, ...prev]);
      setPreviewReport(newReport);
      setGenerating(false);
      showSuccess(`Report ${newId} generated successfully.`);
    }, 600);
  };

  const handleClearForm = () => {
    setSelectedParcel(parcels.length > 0 ? parcels[0].trackingNumber : '');
    setParcelFilter('');
    setReportType('Full Report'); setFileFormat('PDF');
    setStartDate(''); setEndDate('');
    setPreviewReport(null);
  };

  const handleDownload = (report) => {
    // 1. JSON Format Export
    if (report.format === 'JSON') {
      const jsonContent = JSON.stringify(report, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yto_tracking_${report.trackingNo}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSuccess('Downloaded tracking report as JSON.');
      return;
    }

    // 2. CSV / Excel Format Export
    if (report.format === 'CSV') {
      const rows = (report.events || []).map(e => ({
        trackingNo: report.trackingNo,
        time: e.time || '—',
        event: e.event || '—',
        location: e.location || '—',
        status: e.status || '—',
      }));
      exportToCSV(rows, [
        { key: 'trackingNo', label: 'Tracking Number' },
        { key: 'time', label: 'Date & Time' },
        { key: 'event', label: 'Event' },
        { key: 'location', label: 'Location' },
        { key: 'status', label: 'Status' },
      ], `yto_tracking_${report.trackingNo}`);
      showSuccess('Downloaded tracking report as CSV.');
      return;
    }

    if (report.format === 'Excel') {
      const rows = (report.events || []).map(e => ({
        trackingNo: report.trackingNo,
        time: e.time || '—',
        event: e.event || '—',
        location: e.location || '—',
        status: e.status || '—',
      }));
      exportToExcel(rows, [
        { key: 'trackingNo', label: 'Tracking Number' },
        { key: 'time', label: 'Date & Time' },
        { key: 'event', label: 'Event' },
        { key: 'location', label: 'Location' },
        { key: 'status', label: 'Status' },
      ], `yto_tracking_${report.trackingNo}`);
      showSuccess('Downloaded tracking report as Excel worksheet.');
      return;
    }

    // 3. PDF / Printable Report (Default)
    const evRows = (report.events || []).map((e, i) => `
      <tr style="background:${i%2===0?'white':'#f9f9f9'}">
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;">${escHtml(e.time)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;">${escHtml(e.event)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;">${escHtml(e.location)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;">
          <span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;background:${statusBg(e.status)};color:${statusColor(e.status)};">${escHtml(e.status)}</span>
        </td>
      </tr>`).join('');
    const win = window.open('', '_blank');
    if (!win) {
      toast('Please allow popups to print tracking reports.', 'error');
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>Tracking Report — ${escHtml(report.trackingNo)}</title>
      <style>body{font-family:-apple-system,sans-serif;padding:32px;color:#1a1a1a;}h1{font-size:22px;color:#390955;margin-bottom:4px;}.meta{font-size:12px;color:#666;margin-bottom:24px;}.info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px;}.info-card{padding:12px 16px;background:#f9f7ff;border:1px solid #e5ddf0;border-radius:8px;}.info-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;color:#9b82b2;margin-bottom:4px;}.info-value{font-size:14px;font-weight:700;color:#390955;}table{width:100%;border-collapse:collapse;}th{padding:10px 12px;background:#390955;color:white;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.3px;}@media print{body{padding:16px;}}</style>
      </head><body>
      <h1>Tracking Report — YTO Express</h1>
      <div class="meta">Generated: ${escHtml(report.generatedDate)} · Report ID: ${escHtml(report.id)} · Type: ${escHtml(report.reportType)} · Format: ${escHtml(report.format)}</div>
      <div class="info-grid">
        <div class="info-card"><div class="info-label">Tracking Number</div><div class="info-value">${escHtml(report.trackingNo)}</div></div>
        <div class="info-card"><div class="info-label">Location</div><div class="info-value">${escHtml(report.location)}</div></div>
        <div class="info-card"><div class="info-label">Period</div><div class="info-value">${escHtml(report.startDate) || '—'} to ${escHtml(report.endDate) || '—'}</div></div>
      </div>
      <h3 style="color:#390955;margin-bottom:12px;">Tracking Events Timeline</h3>
      ${(report.events||[]).length>0
        ? `<table><thead><tr><th>Date &amp; Time</th><th>Event</th><th>Location</th><th>Status</th></tr></thead><tbody>${evRows}</tbody></table>`
        : `<p style="color:#aaa;font-size:13px;">No tracking events recorded.</p>`}
      <script>window.onload=function(){window.print();}\x3C/script>
      </body></html>`);
    win.document.close();
  };

  return (
    <div style={{ flex: 1, padding: '24px 30px 48px', backgroundColor: '#f0ecf7', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif" }}>
      <PageHeader
        title="Generate Tracking Information"
        subtitle="Generate and retrieve printable tracking reports and data exports for parcels"
        breadcrumb={['Dashboard', 'Shipments', 'Generate Tracking Information']}
        actions={(
          <RefreshButton
            onClick={handleRefresh}
            isRefreshing={isRefreshing}
          />
        )}
      />

      <SectionCard
        noPadding
        className="mb-6"
      >
        <CardSectionHeader
          icon={FileText}
          title="Generate Tracking Report"
          subtitle="Select a registered parcel to extract and compile an event manifest and route timeline"
        />

        <div className="p-6">
          <div className="bg-[#faf8fc]/80 rounded-xl border border-[#e4d8f2] p-5 space-y-4">
            {/* 1. Parcel Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-[#390955] uppercase tracking-wider">
                  Select Parcel Tracking Number *
                </label>
                {parcels.length > 5 && (
                  <span className="text-[11px] text-slate-400">
                    {filteredParcelsForSelect.length} of {parcels.length} available
                  </span>
                )}
              </div>

              {/* Quick Search Helper for large parcel sets */}
              {parcels.length > 5 && (
                <div className="relative mb-2">
                  <input
                    type="text"
                    placeholder="Type to filter tracking number, destination, or recipient..."
                    value={parcelFilter}
                    onChange={e => setParcelFilter(e.target.value)}
                    className="w-full h-[36px] pl-8 pr-3 border border-[#cbd5e1] rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:border-[#390955]"
                  />
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              )}

              {loadingParcels ? (
                <div className="h-[40px] px-3 flex items-center border border-[#cbd5e1] rounded-lg text-xs text-slate-400 bg-white">
                  Loading parcels from database...
                </div>
              ) : parcels.length === 0 ? (
                <div className="h-[40px] px-3 flex items-center border border-red-200 rounded-lg text-xs font-medium text-red-600 bg-red-50">
                  No parcels registered yet. Register parcels in Manage Parcels first.
                </div>
              ) : (
                <select
                  className="w-full h-[40px] px-3 border border-[#cbd5e1] rounded-lg text-xs font-semibold text-[#390955] bg-white focus:outline-none focus:border-[#390955] transition-colors cursor-pointer"
                  value={selectedParcel}
                  onChange={e => setSelectedParcel(e.target.value)}
                >
                  <option value="">— Select a parcel —</option>
                  {filteredParcelsForSelect.map(p => (
                    <option key={p._id} value={p.trackingNumber}>
                      {p.trackingNumber} · {p.destination || p.origin || 'Delivery Route'} ({p.status || 'Active'})
                    </option>
                  ))}
                </select>
              )}

              {/* Selected Parcel Summary Strip */}
              {currentParcelDetails && (
                <div className="mt-3 p-3 bg-white rounded-lg border border-[#e4d8f2] flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-md bg-[#f0eaf8] text-[#390955] flex items-center justify-center font-bold shrink-0">
                      <Package size={15} />
                    </div>
                    <div>
                      <div className="font-bold text-[#390955] font-mono">{currentParcelDetails.trackingNumber}</div>
                      <div className="text-[11px] text-slate-500">
                        {currentParcelDetails.senderName || 'Sender'} &rarr; {currentParcelDetails.receiverName || 'Recipient'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-slate-600">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Route</span>
                      <span className="font-medium text-slate-700">{currentParcelDetails.origin || 'Origin'} &rarr; {currentParcelDetails.destination || 'Destination'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Status</span>
                      <span
                        className="inline-block px-2 py-0.5 rounded text-[10px] font-bold"
                        style={{ background: statusBg(currentParcelDetails.status || 'Pending'), color: statusColor(currentParcelDetails.status || 'Pending') }}
                      >
                        {currentParcelDetails.status || 'Pending'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Report Configuration Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#390955] uppercase tracking-wider mb-2">Report Type *</label>
                <select
                  className="w-full h-[40px] px-3 border border-[#cbd5e1] rounded-lg text-xs font-semibold text-[#390955] bg-white focus:outline-none focus:border-[#390955] transition-colors cursor-pointer"
                  value={reportType}
                  onChange={e => setReportType(e.target.value)}
                >
                  <option>Full Report</option>
                  <option>Route Milestones</option>
                  <option>Delivery Summary</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#390955] uppercase tracking-wider mb-2">Export Format *</label>
                <select
                  className="w-full h-[40px] px-3 border border-[#cbd5e1] rounded-lg text-xs font-semibold text-[#390955] bg-white focus:outline-none focus:border-[#390955] transition-colors cursor-pointer"
                  value={fileFormat}
                  onChange={e => setFileFormat(e.target.value)}
                >
                  <option value="PDF">Printable PDF Report</option>
                  <option value="Excel">Excel Worksheet (.xls)</option>
                  <option value="CSV">Spreadsheet CSV (.csv)</option>
                  <option value="JSON">JSON Data Export (.json)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#390955] uppercase tracking-wider mb-2">Start Date</label>
                <input
                  type="date"
                  className="w-full h-[40px] px-3 border border-[#cbd5e1] rounded-lg text-xs text-[#390955] bg-white focus:outline-none focus:border-[#390955] transition-colors cursor-pointer"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#390955] uppercase tracking-wider mb-2">End Date</label>
                <input
                  type="date"
                  className="w-full h-[40px] px-3 border border-[#cbd5e1] rounded-lg text-xs text-[#390955] bg-white focus:outline-none focus:border-[#390955] transition-colors cursor-pointer"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* 3. Action Buttons — Right Aligned: Clear and Generate Report */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#e8e0f0]">
              <button
                type="button"
                className="h-[40px] px-5 rounded-lg bg-white border border-[#cbd5e1] text-[#390955] text-xs font-bold hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
                onClick={handleClearForm}
              >
                Clear
              </button>
              <button
                type="button"
                className="flex items-center gap-2 h-[40px] px-5 rounded-lg bg-[#390955] text-white text-xs font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleGenerate}
                disabled={generating || parcels.length === 0}
              >
                {generating ? (
                  <><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Generating…</>
                ) : (
                  <><FileText size={14} aria-hidden="true" /> Generate Report</>
                )}
              </button>
            </div>
          </div>

          {/* Generated Report Preview */}
          {previewReport && (
            <div className="mt-5 bg-[#faf8fc] border border-[#d4b8ee] rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-[#390955] flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600" aria-hidden="true" /> Report Ready — {previewReport.id}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Tracking: <strong className="font-mono text-brand-orange">{previewReport.trackingNo}</strong> · Generated {previewReport.generatedDate}
                  </div>
                </div>
                <Tooltip content={`Download report as ${previewReport.format}`}>
                  <button
                    className="flex items-center gap-2 h-[34px] px-4 rounded-lg bg-[#f37021] text-white text-xs font-bold hover:brightness-105 transition-all cursor-pointer shadow-sm"
                    onClick={() => handleDownload(previewReport)}
                  >
                    <Download size={13} aria-hidden="true" /> Download {previewReport.format}
                  </button>
                </Tooltip>
              </div>

              {previewReport.events.length > 0 && (
                <div className="bg-white rounded-lg border border-[#e8e0f0] overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#f8fafc] border-b border-[#e2e8f0]">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Tracking Events Timeline ({previewReport.events.length} events)
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                    {previewReport.events.map((ev, i) => (
                      <div key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50/50 transition-colors">
                        <div className="w-2 h-2 rounded-full bg-[#f37021] mt-1.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-slate-900">{ev.event}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">{ev.time} · {ev.location}</div>
                        </div>
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: statusBg(ev.status), color: statusColor(ev.status) }}
                        >
                          {ev.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {/* Standardized Generated Reports Table */}
      <SectionCard
        noPadding
        className="mb-6"
      >
        <CardSectionHeader
          icon={FileText}
          title="Generated Reports Ledger"
          subtitle={`${filteredReports.length} of ${reports.length} session reports available for download or print`}
        />

        <FilterBar>
          <FilterBar.Group>
            <FilterBar.Search
              placeholder="Search by report ID, tracking number, or route..."
              value={reportSearchTerm}
              onChange={(e) => { setReportSearchTerm(e.target.value); setReportCurrentPage(1); }}
            />
            <FilterBar.Select
              aria-label="Filter by format"
              value={reportFormatFilter}
              onChange={(e) => { setReportFormatFilter(e.target.value); setReportCurrentPage(1); }}
            >
              <option value="All" className="font-medium text-slate-700 bg-white">All</option>
              <option value="PDF" className="font-medium text-slate-700 bg-white">PDF</option>
              <option value="Excel" className="font-medium text-slate-700 bg-white">Excel</option>
              <option value="CSV" className="font-medium text-slate-700 bg-white">CSV</option>
              <option value="JSON" className="font-medium text-slate-700 bg-white">JSON</option>
            </FilterBar.Select>
            <FilterBar.Select
              aria-label="Filter by report type"
              value={reportTypeFilter}
              onChange={(e) => { setReportTypeFilter(e.target.value); setReportCurrentPage(1); }}
            >
              <option value="All" className="font-medium text-slate-700 bg-white">All Report Types</option>
              <option value="Full Report" className="font-medium text-slate-700 bg-white">Full Report</option>
              <option value="Route Milestones" className="font-medium text-slate-700 bg-white">Route Milestones</option>
              <option value="Delivery Summary" className="font-medium text-slate-700 bg-white">Delivery Summary</option>
            </FilterBar.Select>
            <FilterBar.Count count={filteredReports.length} label="reports" />
          </FilterBar.Group>
          <FilterBar.Actions>
            <ExportDropdown
              onExport={handleExportLedger}
              disabled={filteredReports.length === 0}
            />
          </FilterBar.Actions>
        </FilterBar>

        <div style={{ padding: '8px 24px 24px' }}>
          <DataTable className="min-w-[960px]" containerClassName="border border-[#e4d8f2] rounded-xl">
            <DataTable.Head>
              <tr>
                {REPORT_TABLE_HEADERS.map((h, idx) => (
                  <DataTable.Th
                    key={h.label}
                    className="whitespace-nowrap"
                    stickyLeft={idx === 0}
                    align={idx === REPORT_TABLE_HEADERS.length - 1 ? 'right' : 'left'}
                  >
                    {h.label === 'Actions' ? (
                      <span>{h.label}</span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <h.icon size={12} className="text-slate-400" />
                        {h.label}
                      </span>
                    )}
                  </DataTable.Th>
                ))}
              </tr>
            </DataTable.Head>

            <tbody>
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={REPORT_TABLE_HEADERS.length} style={{ padding: '36px 16px' }}>
                    <EmptyState
                      icon={FileText}
                      title={reports.length === 0 ? 'No reports generated yet' : 'No reports match your search'}
                      description={reports.length === 0
                        ? 'Select a registered parcel above and click Generate Report to create tracking documents.'
                        : 'Try a different tracking number, route, or clear your filters.'}
                    />
                  </td>
                </tr>
              ) : (
                currentReportRows.map((r) => (
                  <DataTable.Row key={r.id}>
                    <DataTable.Cell stickyLeft className="whitespace-nowrap">
                      <span className="font-mono text-xs font-bold text-brand-purple">
                        {r.id}
                      </span>
                    </DataTable.Cell>
                    <DataTable.Cell className="whitespace-nowrap font-mono text-xs font-bold text-brand-orange">
                      {r.trackingNo}
                    </DataTable.Cell>
                    <DataTable.Cell className="whitespace-nowrap text-xs text-gray-700">
                      {r.location}
                    </DataTable.Cell>
                    <DataTable.Cell className="whitespace-nowrap text-xs font-medium text-gray-800">
                      {r.reportType}
                    </DataTable.Cell>
                    <DataTable.Cell className="whitespace-nowrap">
                      <Badge tone={r.format === 'PDF' ? 'purple' : r.format === 'Excel' || r.format === 'CSV' ? 'green' : 'blue'}>
                        {r.format}
                      </Badge>
                    </DataTable.Cell>
                    <DataTable.Cell tabularNums className="whitespace-nowrap text-xs text-gray-500">
                      {r.generatedDate}
                    </DataTable.Cell>
                    <DataTable.Cell align="right" className="whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleDownload(r)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 text-brand-purple text-xs font-bold hover:bg-purple-50 transition cursor-pointer"
                        title={`Download as ${r.format}`}
                      >
                        <Download size={12} /> Download
                      </button>
                    </DataTable.Cell>
                  </DataTable.Row>
                ))
              )}
            </tbody>
          </DataTable>
        </div>
      </SectionCard>

      {/* Pagination for Reports Ledger */}
      {filteredReports.length > 0 && (
        <PaginationControls
          currentPage={reportSafePage}
          totalRecords={filteredReports.length}
          rowsPerPage={reportRowsPerPage}
          onPageChange={setReportCurrentPage}
          onRowsPerPageChange={(n) => { setReportRowsPerPage(n); setReportCurrentPage(1); }}
        />
      )}
    </div>
  );
}