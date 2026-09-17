import { useState } from 'react';
import { apiFetch, notificationsApi } from '../services/api';
import { buildSmsMessage } from './registrationCredentials';
import { useToasts } from './useToasts';

/**
 * Shared review → approve → credential-email flow for pending registrations.
 * ProcessSellerInformation and ProcessRiderInformation used to carry ~80
 * identical lines of this logic each; now both delegate here and only pass
 * their queue props + payload builder (`buildPayload` maps a pending item
 * onto the POST body for /sellers or /riders).
 *
 * Flow:
 *   openReview(item)          → show ReviewModal
 *   handleReject(item, why)   → drop from the local pending queue
 *   handleApprove(item)       → open SendSMSModal with generated credentials
 *   handleConfirmSms(email)   → Phase 1: POST the real record (once, even
 *                               across resends); Phase 2: email credentials
 */
export function useRegistrationApproval({ items, setItems, type, buildPayload }) {
  const [reviewItem, setReviewItem]   = useState(null);
  const [smsPayload, setSmsPayload]   = useState(null); // { item, credentials, message }
  const [sendingSms, setSendingSms]   = useState(false);
  const [smsSendError, setSmsSendError] = useState('');
  const { pushToast }                 = useToasts();

  const endpoint = type === 'seller' ? 'sellers' : 'riders';

  const openReview  = (item) => setReviewItem(item);
  const closeReview = () => setReviewItem(null);

  const handleReject = async (item, reason) => {
    const recordId = item._id || item.raw?._id;
    if (recordId) {
      try {
        await apiFetch(`/${endpoint}/${recordId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'Archived',
            statusReason: reason || 'Application rejected by admin',
          }),
        });
      } catch (err) {
        console.warn(`[Reject] Failed to update backend status for ${item.fullName}:`, err);
      }
    }
    setItems((prev) => prev.filter((s) => s.id !== item.id && s._id !== recordId));
    setReviewItem(null);
    pushToast(`${item.fullName}'s application was rejected${reason ? ` — ${reason}` : ''}.`, 'error');
  };

  const handleApprove = (item) => {
    const roleLabel = type === 'seller' ? 'Seller' : 'Rider';
    const credentials = {
      username: item.fullName,
      email: item.email,
      phone: item.phone,
      role: roleLabel,
      password: '(Secured — created during mobile registration)',
    };
    const message = buildSmsMessage({ role: roleLabel });
    setSmsPayload({ item, credentials, message, created: false });
    setSmsSendError('');
    setReviewItem(null);
  };

  const handleCancelSms = () => { setSmsPayload(null); setSmsSendError(''); };

  const handleConfirmSms = async ({ targetEmail }) => {
    const { item, message, created } = smsPayload;
    setSendingSms(true);
    setSmsSendError('');

    // Phase 1: Activate existing record or create new record — only once, even across a resend.
    if (!created) {
      try {
        const recordId = item._id || item.raw?._id;
        let updateResponse;
        if (recordId) {
          updateResponse = await apiFetch(`/${endpoint}/${recordId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: type === 'seller' ? 'ACTIVE' : 'Active' }),
          });
        } else {
          updateResponse = await apiFetch(`/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildPayload(item)),
          });
        }
        if (!updateResponse.ok) throw new Error('Failed to activate record');
        // Remove from the pending queue entirely — it's now an active record in
        // MongoDB, so leaving a stale copy here would just grow the local
        // queue forever and risk it reappearing as "Pending" again.
        setItems((prev) => prev.filter((s) => s.id !== item.id && s._id !== recordId));
        setSmsPayload((prev) => (prev ? { ...prev, created: true } : prev));
      } catch (err) {
        console.error(`Error activating ${endpoint.slice(0, -1)} record:`, err);
        setSmsSendError(`Failed to activate the ${type} account. Check your backend connection and try again.`);
        setSendingSms(false);
        return;
      }
    }

    // Phase 2: email the approval notice via Gmail
    try {
      await notificationsApi.sendEmail({ to: targetEmail, subject: 'Your YTO Express account has been approved', message });

      setSmsPayload(null);
      pushToast(`Account Approved & Notification Emailed to ${targetEmail}`, 'success');
    } catch (err) {
      console.error('Error sending email notification:', err);
      setSmsPayload(null);
      pushToast(`Account Approved successfully (Notification email could not be sent to ${targetEmail})`, 'warning');
    } finally {
      setSendingSms(false);
    }
  };

  // Defensive: items prop can fall back to a local copy, but the queue is
  // owned by the parent page (which picks its own fallback list).
  const pendingItems = (items ?? []).filter((s) => s.status === 'Pending' || s.status === 'PENDING_VERIFICATION');

  return {
    pendingItems,
    reviewItem, openReview, closeReview, handleApprove, handleReject,
    smsPayload, handleCancelSms, handleConfirmSms, sendingSms, smsSendError,
  };
}
