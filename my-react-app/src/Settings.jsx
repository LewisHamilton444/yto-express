import React, { useState, useCallback } from 'react';
import SettingsArchiveView from './SettingsArchiveView';
import PageHeader from './components/ui/PageHeader';
import SectionCard from './components/ui/SectionCard';
import StatCard from './components/ui/StatCard';
import RefreshButton from './components/ui/RefreshButton';
import { Info } from 'lucide-react';

export default function Settings() {
  const [archiveCounts, setArchiveCounts] = useState({
    sellers: 0,
    riders: 0,
    customers: 0,
    parcels: 0,
  });
  const [lastUpdated, setLastUpdated] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return (
    <div className="p-6 md:p-8 w-full space-y-6">
      <PageHeader
        title="Archives"
        subtitle="Centralized lifecycle hub to inspect and manage archived sellers, riders, customers, and shipments"
        breadcrumb={['Dashboard', 'Admin', 'Archives']}
        actions={
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-slate-400 font-medium">Updated {lastUpdated}</span>
            )}
            <RefreshButton onClick={handleRefresh} isRefreshing={isRefreshing} />
          </div>
        }
      />

      {/* Summary Metrics */}
      <StatCard.Grid cols={4} className="mb-6">
        <StatCard
          label="Archived Sellers"
          value={archiveCounts.sellers}
          sub={archiveCounts.sellers === 0 ? 'None archived' : `${archiveCounts.sellers} merchant record${archiveCounts.sellers === 1 ? '' : 's'}`}
          tone="purple"
          trend={archiveCounts.sellers > 0 ? 'Archived' : 'Clean'}
          trendTone={archiveCounts.sellers > 0 ? 'warning' : 'positive'}
        />
        <StatCard
          label="Archived Riders"
          value={archiveCounts.riders}
          sub={archiveCounts.riders === 0 ? 'None archived' : `${archiveCounts.riders} rider record${archiveCounts.riders === 1 ? '' : 's'}`}
          tone="orange"
          trend={archiveCounts.riders > 0 ? 'Archived' : 'Clean'}
          trendTone={archiveCounts.riders > 0 ? 'warning' : 'positive'}
        />
        <StatCard
          label="Archived Customers"
          value={archiveCounts.customers}
          sub={archiveCounts.customers === 0 ? 'None archived' : `${archiveCounts.customers} customer record${archiveCounts.customers === 1 ? '' : 's'}`}
          tone="blue"
          trend={archiveCounts.customers > 0 ? 'Archived' : 'Clean'}
          trendTone={archiveCounts.customers > 0 ? 'warning' : 'positive'}
        />
        <StatCard
          label="Archived Shipments"
          value={archiveCounts.parcels}
          sub={archiveCounts.parcels === 0 ? 'None archived' : `${archiveCounts.parcels} terminal shipment${archiveCounts.parcels === 1 ? '' : 's'}`}
          tone="emerald"
          trend="Completed"
          trendTone="positive"
        />
      </StatCard.Grid>

      {/* Archive Ledger */}
      <SettingsArchiveView
        onCountsChange={setArchiveCounts}
        refreshTrigger={refreshTrigger}
        onLoadingChange={setIsRefreshing}
        onLoaded={setLastUpdated}
      />

      {/* Tracking Reports Note */}
      <SectionCard
        icon={Info}
        title="Tracking Reports & Archival Scope"
        subtitle="Guidelines on generated logistics reports and stored records"
        className="border border-[#e4d8f2]"
      >
        <div className="p-6 text-xs text-gray-600 leading-relaxed">
          Tracking reports are generated on demand from the Tracking Reports ledger and are not stored as archived records. Archived sellers, riders, customers, and shipments above represent the saved records in the system.
        </div>
      </SectionCard>
    </div>
  );
}
