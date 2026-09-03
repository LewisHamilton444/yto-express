'use client';
import React, { useState } from 'react';
import './ProcessSellerInformation.css';

import { initialPendingSellers } from './verification/mockPendingRegistrations';
import { buildSellerPayloadFromPendingRegistration } from './sellerRiderData';
import { useRegistrationApproval } from './verification/useRegistrationApproval';
import PendingVerificationsTable from './verification/PendingVerificationsTable';
import ReviewModal from './verification/ReviewModal';
import SendSMSModal from './verification/SendSMSModal';
import Toast from './verification/Toast';

const ProcessSellerInformation = ({ pendingSellers: sellersProp, setPendingSellers: setSellersProp }) => {
  // Falls back to local state if rendered without the lifted props (defensive
  // only — in the real app this always comes from AnalyticsDashboard now, so
  // the queue survives navigating to another sidebar section and back).
  const [localSellers, setLocalSellers] = useState(initialPendingSellers);
  const sellers    = sellersProp    ?? localSellers;
  const setSellers = setSellersProp ?? setLocalSellers;

  // Review/approve/email flow is shared with the rider page — see the hook.
  const {
    pendingItems: pendingSellers,
    reviewItem, openReview, closeReview, handleApprove, handleReject,
    smsPayload, handleCancelSms, handleConfirmSms, sendingSms, smsSendError,
    toasts,
  } = useRegistrationApproval({
    items: sellers,
    setItems: setSellers,
    type: 'seller',
    buildPayload: buildSellerPayloadFromPendingRegistration,
  });

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
