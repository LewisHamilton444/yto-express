// Central page registry — single source of truth for sidebar navigation,
// hash routing, and deep-link validation. Exported from App.jsx's old inline
// const so other modules (hash routing, search snapshot routing) can import
// it without creating a component-dependency cycle.
import AnalyticsDashboard from './AnalyticsDashboard';
import ProcessSellerInformation from './ProcessSellerInformation';
import ViewSeller from './ViewSeller';
import ProcessParcelInformation from './ProcessParcelInformation';
import ManageParcels from './ManageParcels';
import ProcessRiderInformation from './ProcessRiderInformation';
import MonitorRiderStatus from './MonitorRiderStatus';
import GenerateRiderDataReport from './GenerateRiderDataReport';
import CustomerList from './CustomerList';
import ActivityLog from './ActivityLog';
import AppNotifications from './AppNotifications';
import ManageAccounts from './ManageAccounts';
import HubParcelReceiving from './HubParcelReceiving';
import ManageIssues from './ManageIssues';
import ManageParcelLocation from './ManageParcelLocation';
import MonitorParcel from './MonitorParcel';
import GenerateTrackingInformation from './GenerateTrackingInformation';
import Settings from './Settings';
import Logout from './Logout';

export const PAGE_MAP = {
  'dashboard':           AnalyticsDashboard,
  'process-seller':      ProcessSellerInformation,
  'seller-report':       ViewSeller,
  'process-parcel':      ProcessParcelInformation,
  'manage-parcels':      ManageParcels,
  'process-rider':       ProcessRiderInformation,
  'monitor-rider':       MonitorRiderStatus,
  'rider-report':        GenerateRiderDataReport,
  'customer-list':       CustomerList,
  'activity-log':        ActivityLog,
  'app-notifications':   AppNotifications,
  'manage-accounts':     ManageAccounts,
  'hub-parcels':         HubParcelReceiving,
  'manage-issues':       ManageIssues,
  'parcel-location':     ManageParcelLocation,
  'geofence':            MonitorParcel,
  'tracking-info':       GenerateTrackingInformation,
  'settings':            Settings,
  'logout':              Logout,
};
