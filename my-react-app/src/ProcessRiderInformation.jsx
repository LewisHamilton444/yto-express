'use client';
import React, { useState } from 'react';
import './ProcessRiderInformation.css';

import { initialPendingRiders } from './verification/mockPendingRegistrations';
import { buildRiderPayloadFromPendingRegistration } from './sellerRiderData';
import { useRegistrationApproval } from './verification/useRegistrationApproval';
import PendingVerificationsTable from './verification/PendingVerificationsTable';
import ReviewModal from './verification/ReviewModal';
import SendSMSModal from './verification/SendSMSModal';
import Toast from './verification/Toast';

const ProcessRiderInformation = ({ pendingRiders: ridersProp, setPendingRiders: setRidersProp }) => {
  // Falls back to local state if rendered without the lifted props (defensive
  // only — in the real app this always comes from AnalyticsDashboard now, so
  // the queue survives navigating to another sidebar section and back).
  const [localRiders, setLocalRiders] = useState(initialPendingRiders);
  const riders    = ridersProp    ?? localRiders;
  const setRiders = setRidersProp ?? setLocalRiders;

  // Review/approve/email flow is shared with the seller page — see the hook.
  const {
    pendingItems: pendingRiders,
    reviewItem, openReview, closeReview, handleApprove, handleReject,
    smsPayload, handleCancelSms, handleConfirmSms, sendingSms, smsSendError,
    toasts,
  } = useRegistrationApproval({
    items: riders,
    setItems: setRiders,
    type: 'rider',
    buildPayload: buildRiderPayloadFromPendingRegistration,
  });

  return (
    <div className="process-rider-information-main-content">
      <div className="process-rider-information-container-inner">

        <header className="process-rider-information-card-header">
          <h1 className="process-rider-information-h1">Process Rider Information</h1>
          <p className="process-rider-information-subtitle">Review pending rider registrations submitted from the mobile app</p>
          <nav className="pri-breadcrumb" aria-label="Breadcrumb">
            <span className="pri-breadcrumb-item">Dashboard</span>
            <span className="pri-breadcrumb-sep">/</span>
            <span className="pri-breadcrumb-item">Manage Rider Information</span>
            <span className="pri-breadcrumb-sep">/</span>
            <span className="pri-breadcrumb-item pri-breadcrumb-item--active">Pending Verifications</span>
          </nav>
        </header>

        <PendingVerificationsTable
          type="rider"
          items={pendingRiders}
          onReview={openReview}
        />

      </div>

      <ReviewModal
        item={reviewItem}
        type="rider"
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

export default ProcessRiderInformation;
