'use client';
import { useState } from 'react';
import { apiFetch, notificationsApi } from '../services/api';
import { generateCredentials, buildSmsMessage } from './mockPendingRegistrations';
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
  const { toasts, pushToast }         = useToasts();

  const endpoint = type === 'seller' ? 'sellers' : 'riders';

  const openReview  = (item) => setReviewItem(item);
  const closeReview = () => setReviewItem(null);

  const handleReject = (item, reason) => {
    setItems((prev) => prev.filter((s) => s.id !== item.id));
    setReviewItem(null);
    pushToast(`${item.fullName}'s application was rejected${reason ? ` — ${reason}` : ''}.`, 'error');
  };

  const handleApprove = (item) => {
    const credentials = generateCredentials(item.fullName);
    const message = buildSmsMessage(credentials);
    setSmsPayload({ item, credentials, message, created: false });
    setSmsSendError('');
    setReviewItem(null);
  };

  const handleCancelSms = () => { setSmsPayload(null); setSmsSendError(''); };

  const handleConfirmSms = async ({ targetEmail }) => {
    const { item, message, created } = smsPayload;
    setSendingSms(true);
    setSmsSendError('');

    // Phase 1: create the real record — only once, even across a resend.
    if (!created) {
      try {
        const createResponse = await apiFetch(`/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(item)),
        });
        if (!createResponse.ok) throw new Error('Failed to create record');
        // Remove from the pending queue entirely — it's now a real record in
        // MongoDB, so leaving a stale copy here would just grow the local
        // queue forever and risk it reappearing as "Pending" again.
        setItems((prev) => prev.filter((s) => s.id !== item.id));
        setSmsPayload((prev) => (prev ? { ...prev, created: true } : prev));
      } catch (err) {
        console.error(`Error creating ${endpoint.slice(0, -1)} record:`, err);
        setSmsSendError(`Failed to create the ${type} account. Check your backend connection and try again.`);
        setSendingSms(false);
        return;
      }
    }

    // Phase 2: email the credentials via Gmail — this part can be resent.
    // (SMS stays dormant until a paid PH provider is configured.)
    try {
      await notificationsApi.sendEmail({ to: targetEmail, subject: 'Your YTO Express account has been approved', message });

      setSmsPayload(null);
      pushToast(`Account Approved & Credentials Emailed to ${targetEmail}`, 'success');
    } catch (err) {
      console.error('Error sending email:', err);
      setSmsSendError(`Failed to email ${targetEmail}. The account has been created — copy the password below or try resending.`);
    } finally {
      setSendingSms(false);
    }
  };

  // Defensive: items prop can fall back to a local copy, but the queue is
  // owned by the parent page (which picks its own fallback list).
  const pendingItems = (items ?? []).filter((s) => s.status === 'Pending');

  return {
    pendingItems,
    reviewItem, openReview, closeReview, handleApprove, handleReject,
    smsPayload, handleCancelSms, handleConfirmSms, sendingSms, smsSendError,
    toasts,
  };
}
