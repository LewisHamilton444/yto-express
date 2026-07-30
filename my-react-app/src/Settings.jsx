import React, { useState } from 'react';
import SettingsArchiveView from './SettingsArchiveView';

export default function Settings({
  currentUser = null,
  /* ── Archived tracking reports still come from AnalyticsDashboard; archived
     sellers/riders are fetched live by SettingsArchiveView from MongoDB ── */
  archivedReports = [],
  onRestoreReport = () => {},
}) {
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const [activeTab, setActiveTab] = useState('account');
  const [archiveCounts, setArchiveCounts] = useState({ sellers: 0, riders: 0 });
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [confirmModal, setConfirmModal] = useState({ show: false, action: '', title: '', message: '' });
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);

  const [profile, setProfile] = useState({
    firstName: 'John', lastName: 'Doe', email: 'admin@ytoexpress.com',
    phone: '+63 912 345 6789', employeeId: 'EMP-2024-001',
    department: 'Operations', position: 'System Administrator',
    branch: 'Metro Manila Hub', dateJoined: '2023-06-01', lastLogin: '2024-02-17 14:32:15',
  });

  const [password, setPassword] = useState({ current: '', new: '', confirm: '' });

  const [security, setSecurity] = useState({
    twoFactorEnabled: true, twoFactorMethod: 'authenticator',
    sessionTimeout: 30, loginAlerts: true,
    trustedDevices: [
      { id: 1, device: 'Chrome on Windows', lastUsed: '2024-02-17 14:32', location: 'Manila, PH',      current: true  },
      { id: 2, device: 'Safari on iPhone',  lastUsed: '2024-02-16 09:15', location: 'Quezon City, PH', current: false },
      { id: 3, device: 'Firefox on MacOS',  lastUsed: '2024-02-10 11:20', location: 'Makati, PH',      current: false },
    ],
  });

  const [roles, setRoles] = useState([
    { id: 1, name: 'Super Admin',         description: 'Full system access with all permissions',      users: 2,
      permissions: { dashboard: { view: true, edit: true }, sellers: { view: true, edit: true, delete: true, add: true }, riders: { view: true, edit: true, delete: true, add: true }, parcels: { view: true, edit: true, delete: true, add: true }, gpsTracking: { view: true, edit: true }, reports: { view: true, export: true, generate: true }, settings: { view: true, edit: true }, users: { view: true, edit: true, delete: true, add: true } } },
    { id: 2, name: 'Operations Manager',  description: 'Manage daily operations and staff',            users: 5,
      permissions: { dashboard: { view: true, edit: false }, sellers: { view: true, edit: true, delete: false, add: true }, riders: { view: true, edit: true, delete: false, add: true }, parcels: { view: true, edit: true, delete: false, add: true }, gpsTracking: { view: true, edit: true }, reports: { view: true, export: true, generate: true }, settings: { view: false, edit: false }, users: { view: true, edit: false, delete: false, add: false } } },
    { id: 3, name: 'Rider Supervisor',    description: 'Oversee rider activities and performance',     users: 12,
      permissions: { dashboard: { view: true, edit: false }, sellers: { view: false, edit: false, delete: false, add: false }, riders: { view: true, edit: true, delete: false, add: false }, parcels: { view: true, edit: false, delete: false, add: false }, gpsTracking: { view: true, edit: false }, reports: { view: true, export: false, generate: false }, settings: { view: false, edit: false }, users: { view: false, edit: false, delete: false, add: false } } },
    { id: 4, name: 'Seller Manager',      description: 'Handle seller accounts and relationships',     users: 8,
      permissions: { dashboard: { view: true, edit: false }, sellers: { view: true, edit: true, delete: false, add: true }, riders: { view: false, edit: false, delete: false, add: false }, parcels: { view: true, edit: false, delete: false, add: false }, gpsTracking: { view: false, edit: false }, reports: { view: true, export: true, generate: false }, settings: { view: false, edit: false }, users: { view: false, edit: false, delete: false, add: false } } },
    { id: 5, name: 'Viewer',              description: 'Read-only access to system data',              users: 15,
      permissions: { dashboard: { view: true, edit: false }, sellers: { view: true, edit: false, delete: false, add: false }, riders: { view: true, edit: false, delete: false, add: false }, parcels: { view: true, edit: false, delete: false, add: false }, gpsTracking: { view: true, edit: false }, reports: { view: true, export: false, generate: false }, settings: { view: false, edit: false }, users: { view: false, edit: false, delete: false, add: false } } },
  ]);

  const [selectedRole, setSelectedRole] = useState(null);

  const [systemConfig, setSystemConfig] = useState({
    companyName: 'YTO Express Philippines Inc.', systemName: 'YTO Express Admin Panel',
    supportEmail: 'support@ytoexpress.com', supportPhone: '+63 2 8888 9999',
    address: '123 Logistics Ave, Makati City, Metro Manila, Philippines',
    timezone: 'Asia/Manila', dateFormat: 'DD/MM/YYYY', timeFormat: '24-hour', currency: 'PHP', language: 'English',
  });

  const [deliveryConfig, setDeliveryConfig] = useState({
    defaultDeliveryRadius: 50, maxDeliveryAttempts: 3, deliveryTimeWindow: '08:00 - 20:00',
    autoAssignRiders: true, priorityDeliveryEnabled: true, codEnabled: true,
    maxCodAmount: 50000, returnProcessDays: 7, parcelWeightLimit: 30, parcelSizeLimit: '60x60x60',
  });

  const [notificationConfig, setNotificationConfig] = useState({
    emailNotifications: true, smsNotifications: true, pushNotifications: true,
    deliveryAlerts: true, systemAlerts: true, dailyReportEmail: true,
    reportRecipients: 'admin@ytoexpress.com, operations@ytoexpress.com',
  });

  const [geofenceConfig, setGeofenceConfig] = useState({
    defaultRadius: 500, minRadius: 100, maxRadius: 2000, trackingInterval: 30,
    historyRetention: 90, alertOnExit: true, alertOnEntry: true,
    alertOnSpeedViolation: true, speedLimit: 60, delayAlertThreshold: 15,
  });

  const [geofenceZones, setGeofenceZones] = useState([
    { id: 1, name: 'Metro Manila Hub',         type: 'Warehouse',    radius: 500, lat: '14.5995', lng: '120.9842', status: 'active',   ridersInZone: 24 },
    { id: 2, name: 'Cebu Distribution Center', type: 'Distribution', radius: 750, lat: '10.3157', lng: '123.8854', status: 'active',   ridersInZone: 12 },
    { id: 3, name: 'Davao Warehouse',           type: 'Warehouse',    radius: 600, lat: '7.1907',  lng: '125.4553', status: 'active',   ridersInZone: 8  },
    { id: 4, name: 'Pampanga Station',          type: 'Station',      radius: 400, lat: '15.0794', lng: '120.6200', status: 'inactive', ridersInZone: 0  },
    { id: 5, name: 'Laguna Hub',                type: 'Hub',          radius: 550, lat: '14.1677', lng: '121.2432', status: 'active',   ridersInZone: 6  },
  ]);

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: '' }), 3000);
  };

  const handleSaveProfile = () => showNotification('Profile updated successfully');

  const handleChangePassword = () => {
    if (password.new !== password.confirm) { showNotification('Passwords do not match', 'error'); return; }
    if (password.new.length < 8) { showNotification('Password must be at least 8 characters', 'error'); return; }
    setPassword({ current: '', new: '', confirm: '' });
    showNotification('Password changed successfully');
  };

  const handleRemoveDevice = (deviceId) => {
    setSecurity(prev => ({ ...prev, trustedDevices: prev.trustedDevices.filter(d => d.id !== deviceId) }));
    showNotification('Device removed successfully');
  };

  const handleTogglePermission = (roleId, module, permission) => {
    setRoles(prev => prev.map(role => {
      if (role.id !== roleId) return role;
      return { ...role, permissions: { ...role.permissions, [module]: { ...role.permissions[module], [permission]: !role.permissions[module][permission] } } };
    }));
  };

  const handleToggleZoneStatus = (zoneId) => {
    setGeofenceZones(prev => prev.map(zone => zone.id === zoneId ? { ...zone, status: zone.status === 'active' ? 'inactive' : 'active' } : zone));
    showNotification('Zone status updated');
  };

  const openResetDatabaseModal = () => {
    setResetConfirmText('');
    setConfirmModal({
      show: true,
      action: 'reset-database',
      title: 'Reset Seller & Rider Database',
      message: 'This permanently deletes every Seller and Rider record from MongoDB — approved, pending, and archived alike. This cannot be undone. Type RESET below to confirm.',
    });
  };

  const closeConfirmModal = () => {
    setConfirmModal({ show: false, action: '', title: '', message: '' });
    setResetConfirmText('');
  };

  const handleConfirmModalAction = async () => {
    if (confirmModal.action === 'reset-database') {
      setResetting(true);
      try {
        const response = await fetch('http://https://yto-express.onrender.com/api/admin/reset-database', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: 'RESET' }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Reset failed');
        showNotification(`Database reset: removed ${result.deleted.sellers} seller(s) and ${result.deleted.riders} rider(s).`);
      } catch (err) {
        showNotification(`Failed to reset database: ${err.message}`, 'error');
      } finally {
        setResetting(false);
        closeConfirmModal();
      }
      return;
    }
    closeConfirmModal();
  };

  const totalArchived = archiveCounts.sellers + archiveCounts.riders + archivedReports.length;

  const tabs = [
    { id: 'account',  label: 'User Account'    },
    { id: 'roles',    label: 'Roles & Access'  },
    { id: 'system',   label: 'System Config'   },
    { id: 'geofence', label: 'Geofence'        },
    { id: 'archived', label: 'Archived Records' },
  ];

  const s = {
    wrapper:      { padding: '30px', background: '#f7f4fa', minHeight: '100vh' },
    header:       { marginBottom: 28, paddingBottom: 24, borderBottom: '1px solid #e0d0f0' },
    h1:           { fontSize: 28, fontWeight: 700, color: '#1a1a1a', margin: 0 },
    subtitle:     { fontSize: 14, color: '#888', margin: '6px 0 0' },
    notification: (type) => ({ padding: '12px 20px', borderRadius: 8, marginBottom: 20, fontWeight: 600, fontSize: 13, background: type === 'error' ? '#fde8f0' : '#e8f5e9', color: type === 'error' ? '#c0392b' : '#2e7d32', border: `1px solid ${type === 'error' ? '#f5c6d0' : '#a5d6a7'}` }),
    tabs:         { display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' },
    tabBtn:       (active) => ({ padding: '9px 18px', borderRadius: 8, border: `1.5px solid ${active ? '#390955' : '#e0d0f0'}`, background: active ? '#390955' : 'white', color: active ? 'white' : '#666', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }),
    section:      { background: 'white', borderRadius: 12, padding: 28, marginBottom: 20, boxShadow: '0 1px 3px rgba(57,9,85,0.06)', border: '1px solid rgba(57,9,85,0.07)', position: 'relative', overflow: 'hidden' },
    sectionAccent:{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #390955, #7b3fa0)' },
    sectionH2:    { fontSize: 16, fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' },
    sectionP:     { fontSize: 12, color: '#999', margin: '0 0 20px' },
    formGrid:     { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 16 },
    formGroup:    { display: 'flex', flexDirection: 'column', gap: 6 },
    label:        { fontSize: 12, fontWeight: 600, color: '#555' },
    input:        { padding: '9px 12px', border: '1.5px solid #e0d0f0', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fdfcfe', color: '#1a1a1a' },
    select:       { padding: '9px 12px', border: '1.5px solid #e0d0f0', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fdfcfe', color: '#1a1a1a', cursor: 'pointer' },
    textarea:     { padding: '9px 12px', border: '1.5px solid #e0d0f0', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fdfcfe', resize: 'vertical' },
    btnPrimary:   { padding: '10px 20px', background: '#390955', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
    btnOutline:   { padding: '10px 20px', background: 'white', color: '#390955', border: '2px solid #390955', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
    btnSmall:     { padding: '5px 12px', background: '#f5eefa', color: '#390955', border: '1px solid #d4b0e8', borderRadius: 6, fontWeight: 600, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', marginRight: 6 },
    btnRestore:   { padding: '7px 16px', background: '#390955', color: 'white', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
    securityOption: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #f0e8f8' },
    secOptionH3:  { fontSize: 13, fontWeight: 700, color: '#1a1a1a', margin: '0 0 3px' },
    secOptionP:   { fontSize: 12, color: '#999', margin: 0 },
    toggleOption: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f0e8f8', fontSize: 13, color: '#333' },
    badge:        (type) => ({ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: type === 'active' ? 'rgba(57,9,85,0.08)' : '#fde8f0', color: type === 'active' ? '#390955' : '#c0392b', border: `1px solid ${type === 'active' ? 'rgba(57,9,85,0.2)' : '#f5c6d0'}` }),
    archivedBadge: { display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#ede4f5', color: '#6d1a9c', border: '1px solid rgba(109,26,156,0.2)' },
    table:        { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    th:           { padding: '11px 14px', background: 'linear-gradient(135deg,#390955,#5a1a80)', color: 'rgba(255,255,255,0.85)', textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' },
    td:           { padding: '12px 14px', borderBottom: '1px solid #f3ecfa', color: '#333', verticalAlign: 'middle' },
    roleCard:     { border: '1.5px solid #ede4f5', borderRadius: 10, marginBottom: 12, overflow: 'hidden' },
    roleHeader:   { padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: '#fdfcfe' },
    statCard:     { padding: '16px 24px', background: '#390955', color: 'white', borderRadius: 10, textAlign: 'center' },
    statValue:    { fontSize: 28, fontWeight: 700, fontFamily: 'monospace' },
    statLabel:    { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
    deviceItem:   (current) => ({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #f0e8f8', background: current ? 'rgba(57,9,85,0.02)' : 'transparent' }),
    twoFactorMethods: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
    methodOption: (selected) => ({ padding: '8px 16px', border: `1.5px solid ${selected ? '#390955' : '#e0d0f0'}`, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: selected ? 600 : 400, background: selected ? 'rgba(57,9,85,0.06)' : 'white', color: selected ? '#390955' : '#555', display: 'flex', alignItems: 'center', gap: 8 }),
    pwReqs:       { background: '#f7f4fa', borderRadius: 8, padding: '12px 16px', marginBottom: 16 },
    pwReqItem:    (met) => ({ fontSize: 12, color: met ? '#390955' : '#bbb', padding: '3px 0', fontWeight: met ? 600 : 400 }),
    modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
    modal:        { background: 'white', borderRadius: 12, padding: 32, maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
    summaryCard:  (color) => ({ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 10, background: 'white', border: `1.5px solid ${color}22`, borderLeft: `4px solid ${color}` }),
    countBadge:   (color) => ({ width: 38, height: 38, borderRadius: '50%', background: `${color}15`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, flexShrink: 0 }),
    emptyState:   { textAlign: 'center', padding: '36px 24px', color: '#bbb', fontSize: 13, background: '#fdfcfe', borderRadius: 10, border: '1.5px dashed #e0d0f0' },
  };

  const Toggle = ({ checked, onChange }) => (
    <div onClick={onChange} style={{ width: 40, height: 22, borderRadius: 11, cursor: 'pointer', position: 'relative', background: checked ? '#390955' : '#ddd', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: checked ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </div>
  );

  return (
    <div style={s.wrapper}>

      <div style={s.header}>
        <h1 style={s.h1}>Settings</h1>
        <p style={s.subtitle}>Manage your account, system configuration, and security settings</p>
      </div>

      {notification.show && <div style={s.notification(notification.type)}>{notification.message}</div>}

      {/* Tabs */}
      <div style={s.tabs}>
        {tabs.map(tab => (
          <button key={tab.id} style={s.tabBtn(activeTab === tab.id)} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
            {tab.id === 'archived' && totalArchived > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: activeTab === 'archived' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: 800 }}>
                {totalArchived}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── ACCOUNT ── */}
      {activeTab === 'account' && (
        <div>
          <div style={s.section}>
            <div style={s.sectionAccent} />
            <h2 style={s.sectionH2}>Profile Information</h2>
            <p style={s.sectionP}>Update your personal details and contact information</p>
            <div style={s.formGrid}>
              {[{ label:'First Name', key:'firstName', type:'text' },{ label:'Last Name', key:'lastName', type:'text' },{ label:'Email Address', key:'email', type:'email' },{ label:'Phone Number', key:'phone', type:'tel' },{ label:'Position', key:'position', type:'text' }].map(field => (
                <div key={field.key} style={s.formGroup}>
                  <label style={s.label}>{field.label}</label>
                  <input style={s.input} type={field.type} value={profile[field.key]} onChange={e => setProfile({ ...profile, [field.key]: e.target.value })} />
                </div>
              ))}
              <div style={s.formGroup}><label style={s.label}>Employee ID</label><input style={{ ...s.input, background: '#f0e8f8', color: '#888' }} type="text" value={profile.employeeId} disabled /></div>
              <div style={s.formGroup}><label style={s.label}>Department</label><select style={s.select} value={profile.department} onChange={e => setProfile({ ...profile, department: e.target.value })}>{['Operations','Logistics','Customer Service','IT','Finance'].map(d => <option key={d}>{d}</option>)}</select></div>
              <div style={s.formGroup}><label style={s.label}>Branch</label><select style={s.select} value={profile.branch} onChange={e => setProfile({ ...profile, branch: e.target.value })}>{['Metro Manila Hub','Cebu Distribution Center','Davao Warehouse','Pampanga Station'].map(b => <option key={b}>{b}</option>)}</select></div>
            </div>
            <button style={s.btnPrimary} onClick={handleSaveProfile}>Save Changes</button>
          </div>

          <div style={s.section}>
            <div style={s.sectionAccent} />
            <h2 style={s.sectionH2}>Change Password</h2>
            <p style={s.sectionP}>Ensure your account is using a secure password</p>
            <div style={{ ...s.formGrid, gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {[{ label:'Current Password', key:'current' },{ label:'New Password', key:'new' },{ label:'Confirm Password', key:'confirm' }].map(f => (
                <div key={f.key} style={s.formGroup}><label style={s.label}>{f.label}</label><input style={s.input} type="password" value={password[f.key]} onChange={e => setPassword({ ...password, [f.key]: e.target.value })} placeholder={`Enter ${f.label.toLowerCase()}`} /></div>
              ))}
            </div>
            <div style={s.pwReqs}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#555', margin: '0 0 8px' }}>Password must contain:</p>
              {[[password.new.length >= 8,'At least 8 characters'],[/[A-Z]/.test(password.new),'One uppercase letter'],[/[a-z]/.test(password.new),'One lowercase letter'],[/[0-9]/.test(password.new),'One number'],[/[!@#$%^&*]/.test(password.new),'One special character']].map(([met, text]) => (
                <div key={text} style={s.pwReqItem(met)}>{met ? '✓' : '○'} {text}</div>
              ))}
            </div>
            <button style={s.btnPrimary} onClick={handleChangePassword}>Update Password</button>
          </div>

          <div style={s.section}>
            <div style={s.sectionAccent} />
            <h2 style={s.sectionH2}>Security Settings</h2>
            <p style={s.sectionP}>Manage your account security and authentication</p>
            <div style={s.securityOption}>
              <div><h3 style={s.secOptionH3}>Two-Factor Authentication</h3><p style={s.secOptionP}>Add an extra layer of security to your account</p></div>
              <Toggle checked={security.twoFactorEnabled} onChange={() => setSecurity({ ...security, twoFactorEnabled: !security.twoFactorEnabled })} />
            </div>
            {security.twoFactorEnabled && (
              <div style={s.twoFactorMethods}>
                {['authenticator','sms','email'].map(method => (
                  <div key={method} style={s.methodOption(security.twoFactorMethod === method)} onClick={() => setSecurity({ ...security, twoFactorMethod: method })}>
                    {method === 'authenticator' ? 'Authenticator App' : method === 'sms' ? 'SMS Code' : 'Email Code'}
                  </div>
                ))}
              </div>
            )}
            <div style={s.securityOption}>
              <div><h3 style={s.secOptionH3}>Login Alerts</h3><p style={s.secOptionP}>Receive notifications for new login attempts</p></div>
              <Toggle checked={security.loginAlerts} onChange={() => setSecurity({ ...security, loginAlerts: !security.loginAlerts })} />
            </div>
            <div style={s.securityOption}>
              <div><h3 style={s.secOptionH3}>Session Timeout</h3><p style={s.secOptionP}>Automatically log out after period of inactivity</p></div>
              <select style={s.select} value={security.sessionTimeout} onChange={e => setSecurity({ ...security, sessionTimeout: parseInt(e.target.value) })}>
                <option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option><option value="120">2 hours</option>
              </select>
            </div>
          </div>

          <div style={s.section}>
            <div style={s.sectionAccent} />
            <h2 style={s.sectionH2}>Trusted Devices</h2>
            <p style={s.sectionP}>Devices that have access to your account</p>
            {security.trustedDevices.map(device => (
              <div key={device.id} style={s.deviceItem(device.current)}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', marginBottom: 3 }}>{device.device}{device.current && <span style={{ ...s.badge('active'), marginLeft: 8 }}>Current</span>}</div>
                  <div style={{ fontSize: 12, color: '#999' }}>Last used: {device.lastUsed} — {device.location}</div>
                </div>
                {!device.current && <button style={s.btnOutline} onClick={() => handleRemoveDevice(device.id)}>Remove</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ROLES ── */}
      {activeTab === 'roles' && (
        <div>
          <div style={s.section}>
            <div style={s.sectionAccent} />
            <h2 style={s.sectionH2}>Role Management</h2>
            <p style={s.sectionP}>Manage user roles and their permissions</p>
            <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
              {[{ value: roles.length, label: 'Total Roles' },{ value: roles.reduce((sum, r) => sum + r.users, 0), label: 'Total Users' },{ value: 8, label: 'Modules' }].map(stat => (
                <div key={stat.label} style={s.statCard}><div style={s.statValue}>{stat.value}</div><div style={s.statLabel}>{stat.label}</div></div>
              ))}
            </div>
            {roles.map(role => (
              <div key={role.id} style={s.roleCard}>
                <div style={s.roleHeader} onClick={() => setSelectedRole(selectedRole === role.id ? null : role.id)}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>{role.name}</div>
                    <div style={{ fontSize: 12, color: '#888', margin: '3px 0' }}>{role.description}</div>
                    <div style={{ fontSize: 11, color: '#390955', fontWeight: 600 }}>{role.users} users assigned</div>
                  </div>
                  <span style={{ fontSize: 20, color: '#390955', fontWeight: 700 }}>{selectedRole === role.id ? '−' : '+'}</span>
                </div>
                {selectedRole === role.id && (
                  <div style={{ padding: '0 20px 20px', overflowX: 'auto' }}>
                    <table style={s.table}>
                      <thead><tr>{['Module','View','Edit','Add','Delete'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                      <tbody>
                        {Object.entries(role.permissions).map(([module, perms]) => (
                          <tr key={module}>
                            <td style={{ ...s.td, fontWeight: 600, color: '#390955' }}>{module.charAt(0).toUpperCase() + module.slice(1).replace(/([A-Z])/g, ' $1')}</td>
                            {['view','edit','add','delete'].map(perm => (
                              <td key={perm} style={s.td}>{perms[perm] !== undefined && <Toggle checked={perms[perm]} onChange={() => handleTogglePermission(role.id, module, perm)} />}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SYSTEM ── */}
      {activeTab === 'system' && (
        <div>
          <div style={s.section}>
            <div style={s.sectionAccent} />
            <h2 style={s.sectionH2}>Company Information</h2>
            <p style={s.sectionP}>Basic information about your organization</p>
            <div style={s.formGrid}>
              {[{ label:'Company Name', key:'companyName', type:'text' },{ label:'System Name', key:'systemName', type:'text' },{ label:'Support Email', key:'supportEmail', type:'email' },{ label:'Support Phone', key:'supportPhone', type:'tel' }].map(f => (
                <div key={f.key} style={s.formGroup}><label style={s.label}>{f.label}</label><input style={s.input} type={f.type} value={systemConfig[f.key]} onChange={e => setSystemConfig({ ...systemConfig, [f.key]: e.target.value })} /></div>
              ))}
              <div style={{ ...s.formGroup, gridColumn: '1 / -1' }}><label style={s.label}>Address</label><textarea style={s.textarea} value={systemConfig.address} onChange={e => setSystemConfig({ ...systemConfig, address: e.target.value })} rows={2} /></div>
            </div>
            <button style={s.btnPrimary} onClick={() => showNotification('System configuration saved')}>Save Changes</button>
          </div>
          <div style={s.section}>
            <div style={s.sectionAccent} />
            <h2 style={s.sectionH2}>Delivery Configuration</h2>
            <p style={s.sectionP}>Configure default delivery settings and limits</p>
            <div style={s.formGrid}>
              {[{ label:'Default Delivery Radius (km)', key:'defaultDeliveryRadius' },{ label:'Return Process Days', key:'returnProcessDays' },{ label:'Max COD Amount (PHP)', key:'maxCodAmount' },{ label:'Parcel Weight Limit (kg)', key:'parcelWeightLimit' }].map(f => (
                <div key={f.key} style={s.formGroup}><label style={s.label}>{f.label}</label><input style={s.input} type="number" value={deliveryConfig[f.key]} onChange={e => setDeliveryConfig({ ...deliveryConfig, [f.key]: parseInt(e.target.value) })} /></div>
              ))}
            </div>
            <button style={s.btnPrimary} onClick={() => showNotification('Delivery settings saved')}>Save Delivery Settings</button>
          </div>
          <div style={s.section}>
            <div style={s.sectionAccent} />
            <h2 style={s.sectionH2}>Notification Settings</h2>
            <p style={s.sectionP}>Configure system notifications and alerts</p>
            <div style={{ marginBottom: 16 }}>
              {[{ key:'emailNotifications', label:'Email Notifications' },{ key:'smsNotifications', label:'SMS Notifications' },{ key:'pushNotifications', label:'Push Notifications' },{ key:'deliveryAlerts', label:'Delivery Status Alerts' },{ key:'systemAlerts', label:'System Alerts' },{ key:'dailyReportEmail', label:'Daily Report Email' }].map(opt => (
                <div key={opt.key} style={s.toggleOption}><Toggle checked={notificationConfig[opt.key]} onChange={() => setNotificationConfig({ ...notificationConfig, [opt.key]: !notificationConfig[opt.key] })} /><span>{opt.label}</span></div>
              ))}
            </div>
            <button style={s.btnPrimary} onClick={() => showNotification('Notification settings saved')}>Save Notification Settings</button>
          </div>

          {isSuperAdmin && (
            <div style={{ ...s.section, border: '1.5px solid #f5c6d0' }}>
              <div style={{ ...s.sectionAccent, background: 'linear-gradient(90deg, #c0392b, #e05a5a)' }} />
              <h2 style={{ ...s.sectionH2, color: '#c0392b' }}>Danger Zone</h2>
              <p style={s.sectionP}>Irreversible actions — restricted to Super Admins. Use only for testing/reset purposes.</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: '#fdf3f3', border: '1px solid #f5c6d0', borderRadius: 8 }}>
                <div>
                  <h3 style={{ ...s.secOptionH3, color: '#c0392b' }}>Reset Seller & Rider Database</h3>
                  <p style={s.secOptionP}>Permanently deletes all Seller and Rider records from MongoDB so you can start fresh with clean registration/verification tests.</p>
                </div>
                <button
                  style={{ padding: '10px 20px', background: '#c0392b', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                  onClick={openResetDatabaseModal}
                >
                  Reset Database
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── GEOFENCE ── */}
      {activeTab === 'geofence' && (
        <div>
          <div style={s.section}>
            <div style={s.sectionAccent} />
            <h2 style={s.sectionH2}>Geofence Settings</h2>
            <p style={s.sectionP}>Configure GPS tracking and geofence boundaries</p>
            <div style={s.formGrid}>
              {[{ label:'Default Radius (m)', key:'defaultRadius' },{ label:'Minimum Radius (m)', key:'minRadius' },{ label:'Maximum Radius (m)', key:'maxRadius' },{ label:'History Retention (days)', key:'historyRetention' },{ label:'Speed Limit (km/h)', key:'speedLimit' },{ label:'Delay Alert Threshold (min)', key:'delayAlertThreshold' }].map(f => (
                <div key={f.key} style={s.formGroup}><label style={s.label}>{f.label}</label><input style={s.input} type="number" value={geofenceConfig[f.key]} onChange={e => setGeofenceConfig({ ...geofenceConfig, [f.key]: parseInt(e.target.value) })} /></div>
              ))}
            </div>
            <button style={s.btnPrimary} onClick={() => showNotification('Geofence configuration saved')}>Save Geofence Settings</button>
          </div>
          <div style={s.section}>
            <div style={s.sectionAccent} />
            <h2 style={s.sectionH2}>Configured Zones</h2>
            <p style={s.sectionP}>Manage delivery zones and boundaries</p>
            <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #ede4f5' }}>
              <table style={s.table}>
                <thead><tr>{['Zone Name','Type','Radius','Coordinates','Riders','Status','Actions'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {geofenceZones.map(zone => (
                    <tr key={zone.id}>
                      <td style={{ ...s.td, fontWeight: 700 }}>{zone.name}</td>
                      <td style={s.td}>{zone.type}</td>
                      <td style={s.td}>{zone.radius}m</td>
                      <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12 }}>{zone.lat}, {zone.lng}</td>
                      <td style={s.td}>{zone.ridersInZone}</td>
                      <td style={s.td}><span style={s.badge(zone.status)}>{zone.status}</span></td>
                      <td style={s.td}><button style={s.btnSmall} onClick={() => handleToggleZoneStatus(zone.id)}>{zone.status === 'active' ? 'Deactivate' : 'Activate'}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          ARCHIVED RECORDS — real data from props
      ══════════════════════════════════════════════ */}
      {activeTab === 'archived' && (
        <div>

          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
            {[
              { label: 'Archived Sellers',          count: archiveCounts.sellers,  color: '#390955' },
              { label: 'Archived Riders',           count: archiveCounts.riders,   color: '#7b3fa0' },
              { label: 'Archived Tracking Reports', count: archivedReports.length, color: '#fb923c' },
            ].map(item => (
              <div key={item.label} style={s.summaryCard(item.color)}>
                <div style={s.countBadge(item.color)}>{item.count}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{item.count === 0 ? 'None archived' : `${item.count} record${item.count > 1 ? 's' : ''} archived`}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Archived Sellers & Riders (live from MongoDB) ── */}
          <div style={s.section}>
            <div style={s.sectionAccent} />
            <h2 style={s.sectionH2}>Archive Manager</h2>
            <p style={s.sectionP}>Archive an active seller/rider, restore an archived one, or permanently delete a record. This is the only place archiving happens now.</p>
            <SettingsArchiveView onCountsChange={setArchiveCounts} />
          </div>

          {/* ── Archived Tracking Reports ── */}
          <div style={s.section}>
            <div style={s.sectionAccent} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={s.sectionH2}>Archived Tracking Reports</h2>
              <span style={s.archivedBadge}>{archivedReports.length} archived</span>
            </div>
            <p style={s.sectionP}>Restore a tracking report to make it available for download again.</p>
            {archivedReports.length === 0 ? (
              <div style={s.emptyState}><div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>No archived tracking reports at the moment.</div>
            ) : (
              <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #ede4f5' }}>
                <table style={s.table}>
                  <thead><tr>{['Report ID','Tracking No.','Generated Date','File Type','Status','Action'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {archivedReports.map((report, idx) => (
                      <tr key={report.id} style={{ background: idx % 2 === 0 ? 'white' : '#fdfcfe' }}>
                        <td style={{ ...s.td, fontWeight: 700, color: '#390955' }}>{report.id}</td>
                        <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12 }}>{report.trackingNo}</td>
                        <td style={s.td}>{report.generatedDate}</td>
                        <td style={s.td}>{report.filetype}</td>
                        <td style={s.td}><span style={s.archivedBadge}>Archived</span></td>
                        <td style={s.td}>
                          <button style={s.btnRestore} onClick={() => { onRestoreReport(report.id); showNotification(`Report ${report.id} restored`); }}>↩ Restore</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {confirmModal.show && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px', color: confirmModal.action === 'reset-database' ? '#c0392b' : '#1a1a1a' }}>{confirmModal.title}</h2>
            <p style={{ fontSize: 14, color: '#666', margin: '0 0 16px' }}>{confirmModal.message}</p>
            {confirmModal.action === 'reset-database' && (
              <div style={{ ...s.formGroup, marginBottom: 20 }}>
                <label style={s.label}>Type RESET to confirm</label>
                <input
                  style={s.input}
                  type="text"
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder="RESET"
                  autoFocus
                />
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button style={s.btnOutline} onClick={closeConfirmModal} disabled={resetting}>Cancel</button>
              <button
                style={{
                  ...s.btnPrimary,
                  ...(confirmModal.action === 'reset-database' ? { background: '#c0392b' } : {}),
                  opacity: (confirmModal.action === 'reset-database' && resetConfirmText !== 'RESET') || resetting ? 0.5 : 1,
                  cursor: (confirmModal.action === 'reset-database' && resetConfirmText !== 'RESET') || resetting ? 'not-allowed' : 'pointer',
                }}
                onClick={handleConfirmModalAction}
                disabled={(confirmModal.action === 'reset-database' && resetConfirmText !== 'RESET') || resetting}
              >
                {resetting ? 'Resetting…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}