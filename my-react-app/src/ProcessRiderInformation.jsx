import React, { useState } from 'react';
import './ProcessRiderInformation.css';
import PageHeader from './components/ui/PageHeader';

import { initialPendingRiders } from './verification/registrationCredentials';
import { buildRiderPayloadFromPendingRegistration, mapRiderToPendingItem } from './sellerRiderData';
import { useRegistrationApproval } from './verification/useRegistrationApproval';
import PendingVerificationsTable from './verification/PendingVerificationsTable';
import ReviewModal from './verification/ReviewModal';
import SendSMSModal from './verification/SendSMSModal';
import RefreshButton from './components/ui/RefreshButton';
import { apiFetch } from './services/api';

const ProcessRiderInformation = ({ pendingRiders: ridersProp, setPendingRiders: setRidersProp }) => {
  // Falls back to local state if rendered without the lifted props (defensive
  // only — in the real app this always comes from AnalyticsDashboard now, so
  // the queue survives navigating to another sidebar section and back).
  const [localRiders, setLocalRiders] = useState(initialPendingRiders);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const riders    = ridersProp    ?? localRiders;
  const setRiders = setRidersProp ?? setLocalRiders;

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      const res = await apiFetch('/riders?status=Pending');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setRiders(data.map(mapRiderToPendingItem));
        }
      }
    } catch (e) {
      console.warn('Failed to refresh pending riders:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Review/approve/email flow is shared with the seller page — see the hook.
  const {
    pendingItems: pendingRiders,
    reviewItem, openReview, closeReview, handleApprove, handleReject,
    smsPayload, handleCancelSms, handleConfirmSms, sendingSms, smsSendError,
  } = useRegistrationApproval({
    items: riders,
    setItems: setRiders,
    type: 'rider',
    buildPayload: buildRiderPayloadFromPendingRegistration,
  });

  return (
    <div className="process-rider-information-main-content">
      <div className="process-rider-information-container-inner">

        <PageHeader
          title="Process Rider Information"
          subtitle="Review pending rider registrations submitted from the mobile app"
          breadcrumb={['Dashboard', 'People', 'Riders', 'Pending Verifications']}
          actions={(
            <RefreshButton
              onClick={handleRefresh}
              isRefreshing={isRefreshing}
            />
          )}
        />

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

    </div>
  );
};

export default ProcessRiderInformation;
