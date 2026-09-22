import React, { useState } from 'react';
import './ProcessSellerInformation.css';
import PageHeader from './components/ui/PageHeader';

import { initialPendingSellers } from './verification/registrationCredentials';
import { buildSellerPayloadFromPendingRegistration, mapSellerToPendingItem } from './sellerRiderData';
import { useRegistrationApproval } from './verification/useRegistrationApproval';
import PendingVerificationsTable from './verification/PendingVerificationsTable';
import ReviewModal from './verification/ReviewModal';
import SendSMSModal from './verification/SendSMSModal';
import RefreshButton from './components/ui/RefreshButton';
import { apiFetch } from './services/api';

const ProcessSellerInformation = ({ pendingSellers: sellersProp, setPendingSellers: setSellersProp }) => {
  // Falls back to local state if rendered without the lifted props (defensive
  // only — in the real app this always comes from AnalyticsDashboard now, so
  // the queue survives navigating to another sidebar section and back).
  const [localSellers, setLocalSellers] = useState(initialPendingSellers);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const sellers    = sellersProp    ?? localSellers;
  const setSellers = setSellersProp ?? setLocalSellers;

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      const res = await apiFetch('/sellers?status=PENDING_VERIFICATION');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setSellers(data.map(mapSellerToPendingItem));
        }
      }
    } catch (e) {
      console.warn('Failed to refresh pending sellers:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Review/approve/email flow is shared with the rider page — see the hook.
  const {
    pendingItems: pendingSellers,
    reviewItem, openReview, closeReview, handleApprove, handleReject,
    smsPayload, handleCancelSms, handleConfirmSms, sendingSms, smsSendError,
  } = useRegistrationApproval({
    items: sellers,
    setItems: setSellers,
    type: 'seller',
    buildPayload: buildSellerPayloadFromPendingRegistration,
  });

  return (
    <div className="process-seller-information-main-content">
      <div className="process-seller-information-container-inner">

        <PageHeader
          title="Process Seller Information"
          subtitle="Review pending seller registrations submitted from the mobile app"
          breadcrumb={['Dashboard', 'People', 'Sellers', 'Pending Verifications']}
          actions={(
            <RefreshButton
              onClick={handleRefresh}
              isRefreshing={isRefreshing}
            />
          )}
        />

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

    </div>
  );
};

export default ProcessSellerInformation;
