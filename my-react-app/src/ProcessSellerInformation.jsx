'use client';
import React, { useState } from 'react';
import './ProcessSellerInformation.css';

import { initialPendingSellers, generateCredentials, buildSmsMessage } from './verification/mockPendingRegistrations';
import PendingVerificationsTable from './verification/PendingVerificationsTable';
import ReviewModal from './verification/ReviewModal';
import SendSMSModal from './verification/SendSMSModal';
import Toast from './verification/Toast';
import { useToasts } from './verification/useToasts';
import { buildSellerPayloadFromPendingRegistration } from './sellerRiderData';

const ProcessSellerInformation = ({ pendingSellers: sellersProp, setPendingSellers: setSellersProp }) => {
  // Falls back to local state if rendered without the lifted props (defensive
  // only — in the real app this always comes from AnalyticsDashboard now, so
  // the queue survives navigating to another sidebar section and back).
  const [localSellers, setLocalSellers] = useState(initialPendingSellers);
  const sellers    = sellersProp    ?? localSellers;
  const setSellers = setSellersProp ?? setLocalSellers;

  const [reviewItem, setReviewItem]   = useState(null);
  const [smsPayload, setSmsPayload]   = useState(null); // { item, credentials, message }
  const [sendingSms, setSendingSms]   = useState(false);
  const [smsSendError, setSmsSendError] = useState('');
  const { toasts, pushToast }         = useToasts();

  const pendingSellers = sellers.filter((s) => s.status === 'Pending');

  const openReview = (item) => setReviewItem(item);
  const closeReview = () => setReviewItem(null);

  const handleReject = (item, reason) => {
    setSellers((prev) => prev.filter((s) => s.id !== item.id));
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

    // Phase 1: create the real seller record — only once, even across a resend.
    if (!created) {
      try {
        const createResponse = await fetch('http://localhost:3001/api/sellers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildSellerPayloadFromPendingRegistration(item)),
        });
        if (!createResponse.ok) throw new Error('Failed to create seller record');
        // Remove from the pending queue entirely — it's now a real seller
        // record in MongoDB, so leaving a stale copy here would just grow
        // the local queue forever and risk it reappearing as "Pending" again.
        setSellers((prev) => prev.filter((s) => s.id !== item.id));
        setSmsPayload((prev) => (prev ? { ...prev, created: true } : prev));
      } catch (err) {
        console.error('Error creating seller record:', err);
        setSmsSendError('Failed to create the seller account. Check your backend connection and try again.');
        setSendingSms(false);
        return;
      }
    }

    // Phase 2: email the credentials via Gmail — this is the part that can be
    // resent. (SMS stays dormant until a paid PH provider is configured.)
    try {
      const emailResponse = await fetch('http://localhost:3001/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: targetEmail, subject: 'Your YTO Express account has been approved', message }),
      });
      const emailResult = await emailResponse.json();
      if (!emailResponse.ok) throw new Error(emailResult.error || 'Email delivery failed');

      setSmsPayload(null);
      pushToast(`Account Approved & Credentials Emailed to ${targetEmail}`, 'success');
    } catch (err) {
      console.error('Error sending email:', err);
      setSmsSendError(`Failed to email ${targetEmail}. The account has been created — copy the password below or try resending.`);
    } finally {
      setSendingSms(false);
    }
  };

  return (
    <div className="process-seller-information-main-content">
      <div className="process-seller-information-container-inner">

        <header className="process-seller-information-card-header">
          <h1 className="process-seller-information-h1">Process Seller Information</h1>
          <p className="process-seller-information-subtitle">Review pending seller registrations submitted from the mobile app</p>
          <nav className="psi-breadcrumb" aria-label="Breadcrumb">
            <span className="psi-breadcrumb-item">Dashboard</span>
            <span className="psi-breadcrumb-sep">/</span>
            <span className="psi-breadcrumb-item">Manage Seller Information</span>
            <span className="psi-breadcrumb-sep">/</span>
            <span className="psi-breadcrumb-item psi-breadcrumb-item--active">Pending Verifications</span>
          </nav>
        </header>

        <PendingVerificationsTable
          type="seller"
          items={pendingSellers}
          onReview={openReview}
        />

      </div>

      <ReviewModal
        item={reviewItem}
        type="seller"
        onClose={closeReview}
        onApprove={handleApprove}
        onReject={handleReject}
      />

      {smsPayload && (
        <SendSMSModal
          item={smsPayload.item}
          credentials={smsPayload.credentials}
          message={smsPayload.message}
          onCancel={handleCancelSms}
          onConfirm={handleConfirmSms}
          sending={sendingSms}
          sendError={smsSendError}
        />
      )}

      <Toast toasts={toasts} />
    </div>
  );
};

export default ProcessSellerInformation;
