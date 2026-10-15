import React, { useCallback, useEffect, useState } from 'react';
import Modal from '../components/ui/Modal';
import ModalHeader from '../components/ui/ModalHeader';
import { Truck } from 'lucide-react';
import { companyVehiclesApi, ridersApi } from '../services/api';
import { useToast } from '../components/ui/useToast';

const STATUS_TINT = { Available: '#16a34a', Assigned: '#1e88e5', Retired: '#9ca3af' };

/**
 * Fleet pool manager (COMPANY riders draw units from here; the company holds
 * each unit's OR/CR once, uploaded by admin). Office-only; delete is
 * super_admin-only server-side. Assign enforces riderType===COMPANY via the
 * server — the 400 body is surfaced verbatim to the operator.
 */
export default function CompanyVehiclePoolModal({ open, onClose, role }) {
  const pushToast = useToast();
  const [vehicles, setVehicles] = useState([]);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [plate, setPlate] = useState('');
  const [makeModel, setMakeModel] = useState('');
  const [vehicleType, setVehicleType] = useState('Motorcycle');
  const [assignEmail, setAssignEmail] = useState({});
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [v, r] = await Promise.all([companyVehiclesApi.list(), ridersApi.list()]);
      setVehicles(Array.isArray(v) ? v : []);
      setRiders(Array.isArray(r) ? r : []);
    } catch {
      pushToast('Could not load the fleet pool. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const handleCreate = async () => {
    if (!plate.trim()) { pushToast('Enter a plate number.'); return; }
    try {
      const res = await companyVehiclesApi.create({ plateNumber: plate, makeModel, vehicleType });
      if (res && res.error) { pushToast(res.error); return; }
      setPlate(''); setMakeModel('');
      pushToast('Vehicle added to the fleet pool.');
      load();
    } catch { pushToast('Could not add the vehicle. Please try again.'); }
  };

  const handleAssign = async (id) => {
    const email = (assignEmail[id] || '').trim().toLowerCase();
    if (!email) { pushToast('Enter the rider email.'); return; }
    setBusyId(id);
    try {
      const res = await companyVehiclesApi.assign(id, email);
      if (res && res.error) { pushToast(res.error); return; }
      setAssignEmail((m) => ({ ...m, [id]: '' }));
      pushToast('Vehicle assigned.');
      load();
    } catch { pushToast('Could not assign the vehicle. Please try again.'); }
    finally { setBusyId(null); }
  };

  const handleUnassign = async (id) => {
    setBusyId(id);
    try {
      const res = await companyVehiclesApi.unassign(id);
      if (res && res.error) { pushToast(res.error); return; }
      pushToast('Vehicle returned to the pool.');
      load();
    } catch { pushToast('Could not unassign the vehicle. Please try again.'); }
    finally { setBusyId(null); }
  };

  const handleRemove = async (id) => {
    setBusyId(id);
    try {
      const res = await companyVehiclesApi.remove(id);
      if (res && res.error) { pushToast(res.error); return; }
      pushToast('Vehicle removed from the fleet pool.');
      load();
    } catch { pushToast('Could not remove the vehicle. Please try again.'); }
    finally { setBusyId(null); }
  };

  if (!open) return null;
  const companyRiders = riders.filter((r) => r.riderType === 'COMPANY');

  return (
    <Modal onBackdropClick={onClose} maxWidth={860} padding={0} label="Company fleet vehicles" cardStyle={{ overflow: 'hidden' }}>
      <ModalHeader
        title="Company Fleet Vehicles"
        subtitle="Company-owned units for COMPANY riders. The company holds each unit's OR/CR; riders never upload vehicle papers."
        icon={Truck}
        onClose={onClose}
      />
      <div style={{ padding: '24px' }}>
      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="Plate number (e.g. ABC 123)" aria-label="Plate number" style={{ flex: '1 1 160px', padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e0f0', fontSize: 13 }} />
        <input value={makeModel} onChange={(e) => setMakeModel(e.target.value)} placeholder="Make / model" aria-label="Make and model" style={{ flex: '1 1 160px', padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e0f0', fontSize: 13 }} />
        <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} aria-label="Vehicle type" style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e0f0', fontSize: 13, background: 'white' }}>
          <option>Motorcycle</option>
          <option>Van</option>
          <option>Truck</option>
        </select>
        <button type="submit" style={{ padding: '10px 22px', borderRadius: 'var(--yto-radius-button, 8px)', border: 'none', background: '#390955', color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Add vehicle</button>
      </form>

      {loading ? (
        <p style={{ fontSize: 13, color: '#6b7280' }}>Loading fleet pool…</p>
      ) : vehicles.length === 0 ? (
        <p style={{ fontSize: 13, color: '#6b7280' }}>No vehicles in the fleet pool yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {vehicles.map((v) => (
            <div key={v._id} style={{ border: '1px solid #e8e0f0', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14, color: '#111827', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>{v.plateNumber}</strong>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{v.makeModel || '—'} · {v.vehicleType}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: STATUS_TINT[v.status] || '#9ca3af', color: 'white' }}>{v.status}</span>
                {v.assignedRiderEmail && (
                  <span style={{ fontSize: 12, color: '#1e88e5' }}>→ {v.assignedRiderEmail}</span>
                )}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  {v.assignedRiderEmail ? (
                    <button onClick={() => handleUnassign(v._id)} disabled={busyId === v._id} style={{ padding: '6px 14px', borderRadius: 'var(--yto-radius-button, 8px)', border: '1px solid #e8e0f0', background: 'white', color: '#390955', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Unassign</button>
                  ) : (
                    <>
                      <select
                        value={assignEmail[v._id] || ''}
                        onChange={(e) => setAssignEmail((m) => ({ ...m, [v._id]: e.target.value }))}
                        aria-label={`Assign rider for ${v.plateNumber}`}
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e8e0f0', fontSize: 12, maxWidth: 220 }}
                      >
                        <option value="">Choose a COMPANY rider…</option>
                        {companyRiders.map((r) => (
                          <option key={r.email} value={r.email}>{r.riderName || r.email} ({r.email})</option>
                        ))}
                      </select>
                      <button onClick={() => handleAssign(v._id)} disabled={busyId === v._id || !assignEmail[v._id]} style={{ padding: '6px 14px', borderRadius: 'var(--yto-radius-button, 8px)', border: 'none', background: '#f37021', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Assign</button>
                    </>
                  )}
                  {role === 'super_admin' && (
                    <button onClick={() => handleRemove(v._id)} disabled={busyId === v._id} style={{ padding: '6px 14px', borderRadius: 'var(--yto-radius-button, 8px)', border: '1px solid #fecaca', background: 'white', color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Remove</button>
                  )}
                </span>
              </div>
              {v.documents && v.documents.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {v.documents.map((d, i) => (
                    <a key={i} href={d.url || d.dataUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#1e88e5' }}>{d.name || 'Document'}</a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </div>
    </Modal>
  );
}
